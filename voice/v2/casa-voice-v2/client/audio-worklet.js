/* AudioWorklet Processor for Casa Voice V2
 *
 * Captures microphone audio at 16kHz, converts float32 to int16 PCM,
 * and sends chunks to the main thread via MessagePort.
 *
 * Render quantum size: 128 samples. We buffer into ~32ms (512 sample) chunks.
 */

class CasaVoiceProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this._buffer = [];
        this._chunkSize = 512;  // 32ms at 16kHz
        this._running = true;

        this.port.onmessage = (event) => {
            if (event.data === 'stop') {
                this._running = false;
            }
        };
    }

    process(inputs, outputs, parameters) {
        if (!this._running) return false;

        const input = inputs[0];
        if (!input || !input.length) return true;

        const inputChannel = input[0];
        if (!inputChannel) return true;

        // Append samples to buffer
        for (let i = 0; i < inputChannel.length; i++) {
            this._buffer.push(inputChannel[i]);
        }

        // Send when we have a full chunk
        while (this._buffer.length >= this._chunkSize) {
            const chunk = this._buffer.splice(0, this._chunkSize);
            const int16Data = new Int16Array(chunk.length);
            for (let i = 0; i < chunk.length; i++) {
                int16Data[i] = Math.max(-32768, Math.min(32767, chunk[i] * 32767));
            }
            this.port.postMessage(int16Data.buffer, [int16Data.buffer]);
        }

        return true;  // keep processor alive
    }
}

registerProcessor('casa-voice-processor', CasaVoiceProcessor);
