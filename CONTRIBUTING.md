# Contributing to 3D Mind Map

## Licence status

`LICENSE-MIT` and `LICENSE-APACHE` are in the repository. They are the recommended **MIT OR Apache-2.0** pair. The maintainer has not confirmed that licence yet. Until that confirmation, treat the licence as pending. A contribution is not a decision that the project has adopted a final licence.

## Developer Certificate of Origin

This project uses a Developer Certificate of Origin sign-off instead of a contributor licence agreement. Add `Signed-off-by: Your Name <you@example.com>` as the last line of each commit message. `git commit -s` does that when `user.name` and `user.email` are set.

```
Developer Certificate of Origin
Version 1.1

Copyright (C) 2004, 2006 The Linux Foundation and its contributors.

Everyone is permitted to copy and distribute verbatim copies of this
license document, but changing it is not allowed.

Developer's Certificate of Origin 1.1

By making a contribution to this project, I certify that:

(a) The contribution was created in whole or in part by me and I
    have the right to submit it under the open source license
    indicated in the file; or

(b) The contribution is based upon previous work that, to the best
    of my knowledge, is covered under an appropriate open source
    license and I have the right under that license to submit that
    work with modifications, whether created in whole or in part
    by me, under the same open source license (unless I am
    permitted to submit under a different license), as indicated
    in the file; or

(c) The contribution was provided directly to me by some other
    person who certified (a), (b) or (c) and I have not modified
    it.

(d) I understand and agree that this project and the contribution
    are public and that a record of the contribution (including all
    personal information I submit with it, including my sign-off) is
    maintained indefinitely and may be redistributed consistent with
    this project or the open source license(s) involved.
```

The "license indicated in the file" is pending the maintainer's confirmation, as noted above.

## What to send

- One focused change, with tests for behaviour you can run here.
- `npm test` should pass.
- Rust file tests, when you touch `src-tauri`: `cargo test --manifest-path src-tauri/Cargo.toml --lib files`.
