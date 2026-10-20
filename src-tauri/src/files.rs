use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const SUPPORTED_MAJOR: u32 = 1;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileStamp {
    pub modified_ms: u64,
    pub len: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveRequest {
    pub path: String,
    pub text: String,
    pub expected: Option<FileStamp>,
    pub rotate_backup: bool,
    pub backup_keep: u32,
    pub backup_location: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryRecord {
    pub id: String,
    pub saved_at: String,
    pub title: String,
    pub path: Option<String>,
    pub map_text: String,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum SaveOutcome {
    Ok { stamp: FileStamp },
    NewerMajor,
    ExternalChange { stamp: FileStamp },
    Failed { message: String },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadResult {
    pub text: String,
    pub stamp: FileStamp,
}

fn modified_ms(meta: &fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn stamp_of(path: &Path) -> std::io::Result<FileStamp> {
    let meta = fs::metadata(path)?;
    Ok(FileStamp {
        modified_ms: modified_ms(&meta),
        len: meta.len(),
    })
}

fn major_of(text: &str) -> Option<u32> {
    let value: serde_json::Value = serde_json::from_str(text).ok()?;
    match value.get("version")? {
        serde_json::Value::String(text) => text.split('.').next()?.parse().ok(),
        serde_json::Value::Number(number) => number.as_u64().map(|value| value as u32),
        _ => None,
    }
}

fn safe_id(id: &str) -> Result<(), String> {
    if id.is_empty()
        || id.len() > 80
        || !id.chars().all(|char| char.is_ascii_alphanumeric() || char == '-' || char == '_')
    {
        return Err("Recovery id is not a safe file name".into());
    }
    Ok(())
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    // Sibling `name.ext.tmp` in the same folder. A crash never leaves the
    // destination half-written, and rename on the same volume is atomic.
    let tmp = tmp_path(path);
    let write_result = (|| {
        let mut file = File::create(&tmp).map_err(|error| error.to_string())?;
        file.write_all(bytes).map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
        Ok(())
    })();
    if let Err(error) = write_result {
        let _ = fs::remove_file(&tmp);
        return Err(error);
    }
    fs::rename(&tmp, path).map_err(|error| error.to_string())?;
    if let Some(parent) = path.parent() {
        if let Ok(dir) = File::open(parent) {
            let _ = dir.sync_all();
        }
    }
    Ok(())
}

fn tmp_path(path: &Path) -> PathBuf {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(".tmp");
    path.with_file_name(name)
}

fn copy_rotated_backup(path: &Path, backup_dir: &Path, keep: u32) -> Result<(), String> {
    if keep == 0 || !path.exists() {
        return Ok(());
    }
    fs::create_dir_all(backup_dir).map_err(|error| error.to_string())?;
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    let file_name = path.file_name().and_then(|name| name.to_str()).unwrap_or("map.mindmap3d");
    let backup = backup_dir.join(format!("{file_name}.{millis}.bak"));
    fs::copy(path, &backup).map_err(|error| error.to_string())?;
    let mut entries = fs::read_dir(backup_dir)
        .map_err(|error| error.to_string())?
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            entry
                .file_name()
                .to_string_lossy()
                .starts_with(file_name)
                && entry.file_name().to_string_lossy().ends_with(".bak")
        })
        .collect::<Vec<_>>();
    entries.sort_by_key(|entry| entry.file_name());
    let extra = entries.len().saturating_sub(keep as usize);
    for entry in entries.into_iter().take(extra) {
        let _ = fs::remove_file(entry.path());
    }
    Ok(())
}

/// Write `text` over `path` only when the file is one this app may change.
/// A newer major version returns [`SaveOutcome::NewerMajor`] before any backup,
/// temp file, or rename.
pub fn save_map(
    path: &Path,
    text: &str,
    expected: Option<&FileStamp>,
    backup_dir: Option<&Path>,
    backup_keep: u32,
    rotate_backup: bool,
) -> SaveOutcome {
    if let Ok(existing) = fs::read_to_string(path) {
        if major_of(&existing).is_some_and(|major| major > SUPPORTED_MAJOR) {
            return SaveOutcome::NewerMajor;
        }
        let stamp = match stamp_of(path) {
            Ok(stamp) => stamp,
            Err(error) => return SaveOutcome::Failed { message: error.to_string() },
        };
        if let Some(expected) = expected {
            if expected != &stamp {
                return SaveOutcome::ExternalChange { stamp };
            }
        }
        if rotate_backup {
            if let Some(dir) = backup_dir {
                if let Err(message) = copy_rotated_backup(path, dir, backup_keep) {
                    return SaveOutcome::Failed { message };
                }
            }
        }
    }
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            if let Err(error) = fs::create_dir_all(parent) {
                return SaveOutcome::Failed { message: error.to_string() };
            }
        }
    }
    if let Err(message) = atomic_write(path, text.as_bytes()) {
        return SaveOutcome::Failed { message };
    }
    match stamp_of(path) {
        Ok(stamp) => SaveOutcome::Ok { stamp },
        Err(error) => SaveOutcome::Failed { message: error.to_string() },
    }
}

pub fn read_map(path: &Path) -> Result<ReadResult, String> {
    let text = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let stamp = stamp_of(path).map_err(|error| error.to_string())?;
    Ok(ReadResult { text, stamp })
}

pub fn write_recovery(dir: &Path, record: &RecoveryRecord) -> SaveOutcome {
    if let Err(message) = safe_id(&record.id) {
        return SaveOutcome::Failed { message };
    }
    if let Some(path) = record.path.as_deref() {
        if let Ok(existing) = fs::read_to_string(path) {
            if major_of(&existing).is_some_and(|major| major > SUPPORTED_MAJOR) {
                return SaveOutcome::NewerMajor;
            }
        }
    }
    if let Err(error) = fs::create_dir_all(dir) {
        return SaveOutcome::Failed { message: error.to_string() };
    }
    let bytes = match serde_json::to_vec_pretty(record) {
        Ok(bytes) => bytes,
        Err(error) => return SaveOutcome::Failed { message: error.to_string() },
    };
    let path = dir.join(format!("{}.json", record.id));
    if let Err(message) = atomic_write(&path, &bytes) {
        return SaveOutcome::Failed { message };
    }
    SaveOutcome::Ok {
        stamp: stamp_of(&path).unwrap_or(FileStamp { modified_ms: 0, len: bytes.len() as u64 }),
    }
}

pub fn list_recovery(dir: &Path) -> Result<Vec<RecoveryRecord>, String> {
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut records = Vec::new();
    for entry in fs::read_dir(dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        let text = fs::read_to_string(&path).map_err(|error| error.to_string())?;
        if let Ok(record) = serde_json::from_str::<RecoveryRecord>(&text) {
            records.push(record);
        }
    }
    records.sort_by(|left, right| left.saved_at.cmp(&right.saved_at));
    Ok(records)
}

pub fn delete_recovery(dir: &Path, id: &str) -> Result<(), String> {
    safe_id(id)?;
    let path = dir.join(format!("{id}.json"));
    if path.exists() {
        fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub fn backup_dir_for(app_data: &Path, location: &str, map_path: &Path) -> PathBuf {
    if location == "beside" {
        return map_path.parent().unwrap_or(Path::new(".")).to_path_buf();
    }
    let stem = map_path.file_stem().and_then(|name| name.to_str()).unwrap_or("map");
    let safe = stem
        .chars()
        .map(|char| if char.is_ascii_alphanumeric() || char == '-' || char == '_' { char } else { '_' })
        .collect::<String>();
    app_data.join("backups").join(safe)
}

pub fn error_log_path(app_data: &Path) -> PathBuf {
    app_data.join("logs").join("error.log")
}

/// Append one local line. Nothing here opens a network connection.
pub fn append_error_line(app_data: &Path, line: &str) -> Result<PathBuf, String> {
    let logs = app_data.join("logs");
    fs::create_dir_all(&logs).map_err(|error| error.to_string())?;
    let path = error_log_path(app_data);
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|error| error.to_string())?;
    let flat = line.replace(['\n', '\r'], " ");
    writeln!(file, "{flat}").map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::process::Command;
    use std::thread;
    use std::time::Duration;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "mindmap3d-{name}-{}-{}",
            std::process::id(),
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn set_mtime(path: &Path, secs: u64) {
        let file = OpenOptions::new().write(true).open(path).unwrap();
        let times = fs::FileTimes::new().set_modified(UNIX_EPOCH + Duration::from_secs(secs));
        file.set_times(times).unwrap();
    }

    #[test]
    fn atomic_save_replaces_the_file_and_rotates_backups() {
        let dir = temp_dir("save");
        let path = dir.join("notes.mindmap3d");
        let backups = dir.join("backups");
        let first = save_map(&path, "{\"version\":\"1.0\",\"n\":1}", None, Some(&backups), 2, false);
        assert!(matches!(first, SaveOutcome::Ok { .. }));
        assert!(!tmp_path(&path).exists());
        let stamp = stamp_of(&path).unwrap();
        let second = save_map(&path, "{\"version\":\"1.0\",\"n\":2}", Some(&stamp), Some(&backups), 2, true);
        assert!(matches!(second, SaveOutcome::Ok { .. }));
        let third_stamp = stamp_of(&path).unwrap();
        let third = save_map(&path, "{\"version\":\"1.0\",\"n\":3}", Some(&third_stamp), Some(&backups), 2, true);
        assert!(matches!(third, SaveOutcome::Ok { .. }));
        let fourth_stamp = stamp_of(&path).unwrap();
        save_map(&path, "{\"version\":\"1.0\",\"n\":4}", Some(&fourth_stamp), Some(&backups), 2, true);
        let kept = fs::read_dir(&backups).unwrap().count();
        assert_eq!(kept, 2);
        assert_eq!(fs::read_to_string(&path).unwrap(), "{\"version\":\"1.0\",\"n\":4}");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn external_change_is_not_overwritten() {
        let dir = temp_dir("external");
        let path = dir.join("notes.mindmap3d");
        save_map(&path, "{\"version\":\"1.0\"}", None, None, 0, false);
        let stamp = stamp_of(&path).unwrap();
        let mut file = OpenOptions::new().write(true).truncate(true).open(&path).unwrap();
        file.write_all(b"{\"version\":\"1.0\",\"from\":\"other\"}").unwrap();
        file.sync_all().unwrap();
        drop(file);
        let outcome = save_map(&path, "{\"version\":\"1.0\",\"from\":\"me\"}", Some(&stamp), None, 5, true);
        assert!(matches!(outcome, SaveOutcome::ExternalChange { .. }));
        assert_eq!(fs::read_to_string(&path).unwrap(), "{\"version\":\"1.0\",\"from\":\"other\"}");
        assert!(!dir.join("backups").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn newer_major_file_bytes_and_mtime_stay_unchanged() {
        let dir = temp_dir("major");
        let path = dir.join("future.mindmap3d");
        let original = "{\"format\":\"mindmap3d\",\"version\":\"2.0\",\"nodes\":{}}";
        fs::write(&path, original).unwrap();
        set_mtime(&path, 1_700_000_000);
        let before = fs::read(&path).unwrap();
        let mtime = fs::metadata(&path).unwrap().modified().unwrap();
        let outcome = save_map(
            &path,
            "{\"version\":\"1.0\",\"nodes\":{\"a\":{}}}",
            Some(&stamp_of(&path).unwrap()),
            Some(&dir.join("backups")),
            5,
            true,
        );
        assert!(matches!(outcome, SaveOutcome::NewerMajor));
        assert_eq!(fs::read(&path).unwrap(), before);
        assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(), mtime);
        assert!(!tmp_path(&path).exists());
        assert!(!dir.join("backups").exists());

        let recovery = dir.join("recovery");
        let record = RecoveryRecord {
            id: "rec-future".into(),
            saved_at: "2026-10-20T18:00:00.000Z".into(),
            title: "Future".into(),
            path: Some(path.display().to_string()),
            map_text: "{\"version\":\"1.0\"}".into(),
        };
        let written = write_recovery(&recovery, &record);
        assert!(matches!(written, SaveOutcome::NewerMajor));
        assert!(!recovery.exists() || fs::read_dir(&recovery).unwrap().count() == 0);
        assert_eq!(fs::read(&path).unwrap(), before);
        assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(), mtime);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn power_cord_recovery_survives_kill() {
        if std::env::var("MINDMAP_RECOVERY_CHILD").ok().as_deref() == Some("1") {
            let dir = PathBuf::from(std::env::var("MINDMAP_RECOVERY_DIR").unwrap());
            let record = RecoveryRecord {
                id: "rec-cord".into(),
                saved_at: "2026-10-20T18:41:00.000Z".into(),
                title: "Power cord".into(),
                path: None,
                map_text: "{\"version\":\"1.0\",\"meta\":{\"title\":\"Power cord\"},\"nodes\":{\"n\":{\"text\":\"# Kept\"}}}".into(),
            };
            let outcome = write_recovery(&dir, &record);
            assert!(matches!(outcome, SaveOutcome::Ok { .. }));
            fs::write(dir.join("ready"), "1").unwrap();
            thread::sleep(Duration::from_secs(30));
            delete_recovery(&dir, "rec-cord").unwrap();
            return;
        }

        let dir = temp_dir("cord");
        let exe = std::env::current_exe().unwrap();
        let mut child = Command::new(exe)
            .env("MINDMAP_RECOVERY_CHILD", "1")
            .env("MINDMAP_RECOVERY_DIR", &dir)
            .args(["files::tests::power_cord_recovery_survives_kill", "--exact"])
            .spawn()
            .unwrap();
        let ready = dir.join("ready");
        for _ in 0..100 {
            if ready.exists() {
                break;
            }
            thread::sleep(Duration::from_millis(50));
        }
        assert!(ready.exists(), "recovery child did not finish the write");
        child.kill().unwrap();
        let _ = child.wait();
        let found = list_recovery(&dir).unwrap();
        assert_eq!(found.len(), 1);
        assert!(found[0].map_text.contains("# Kept"));
        assert!(dir.join("rec-cord.json").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn error_log_stays_in_the_app_data_folder() {
        let dir = temp_dir("errlog");
        let path = append_error_line(&dir, "2026-10-20T20:00:00.000Z error disk full").unwrap();
        append_error_line(&dir, "second line\nwith a break").unwrap();
        let text = fs::read_to_string(&path).unwrap();
        assert!(path.ends_with("logs/error.log"));
        assert!(path.starts_with(&dir));
        assert!(text.contains("disk full"));
        assert!(text.contains("second line with a break"));
        assert_eq!(text.lines().count(), 2);
        let _ = fs::remove_dir_all(&dir);
    }
}
