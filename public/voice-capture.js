class VoiceCaptureProcessor extends AudioWorkletProcessor {
  constructor({ processorOptions }) {
    super();
    this.samples = new Float32Array(Math.ceil(sampleRate * processorOptions.seconds));
    this.length = 0;
    this.finished = false;
    this.port.onmessage = () => this.finish();
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    this.port.postMessage(this.samples.subarray(0, this.length), [this.samples.buffer]);
  }

  process(inputs) {
    if (this.finished) return false;
    const channel = inputs[0]?.[0];
    if (channel) {
      const block = channel.subarray(0, this.samples.length - this.length);
      this.samples.set(block, this.length);
      this.length += block.length;
      if (this.length === this.samples.length) this.finish();
    }
    return !this.finished;
  }
}

registerProcessor("voice-capture", VoiceCaptureProcessor);
