# DeepSeek voice input

Date: 2026-11-15

## Decision

Record up to 20 seconds after the user presses the microphone button. The browser converts the clip to mono 16 kHz PCM WAV. Stopping sends it to `POST /api/v1/assistant/transcribe`. The endpoint checks the audio header, limits the request size and uses the shared rate limiter. The server-only adapter sends a multipart file to [DeepSeek ASR](https://api-docs.deepseek.com/guides/asr/) with the existing key when the configured assistant provider is DeepSeek directly. The browser receives an editable transcript. The question is submitted only through the existing text form.

The microphone is available to this site under the existing browser permission prompt. The form names DeepSeek before sending audio. Cancellation and navigation release the microphone. Audio and transcripts are held in memory and the app does not cache, save or log them. DeepSeek processes each submitted clip and detects the language.

The bus catalogue links to the assistant for trip searches. The previous stop-to-stop planner is available from the assistant as a manual fallback and still computes in the browser.
