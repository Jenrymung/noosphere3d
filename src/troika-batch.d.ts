import { Text } from "troika-three-text";

declare module "troika-three-text" {
  export class BatchedText extends Text {
    addText(text: Text): void;
    sync(callback?: () => void): void;
    dispose(): void;
  }
}
