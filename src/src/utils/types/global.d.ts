import "./SpeechRecognition";

export { };

declare global {
  type Fn<Args extends any[] = [], R = void> = (...args: Args) => R;
}
