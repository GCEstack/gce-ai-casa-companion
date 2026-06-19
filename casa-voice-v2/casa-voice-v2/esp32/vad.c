/* vad.c — Energy VAD with Hysteresis
 *
 * Frame size: 30ms @ 16kHz = 480 samples
 * Energy = sum(abs(samples)) / sample_count
 * Normalized energy = energy / 32768.0
 */

#include "vad.h"
#include "esp_log.h"
#include <math.h>
#include <string.h>

static const char *TAG = "VAD";

static float g_threshold = 0.025f;
static int g_frames_to_trigger = 3;
static int g_frames_to_release = 10;

static int g_speech_counter = 0;
static int g_silence_counter = 0;
static bool g_is_speech = false;

void vad_init(float threshold, int frames_to_trigger, int frames_to_release)
{
    g_threshold = threshold;
    g_frames_to_trigger = frames_to_trigger;
    g_frames_to_release = frames_to_release;
    g_speech_counter = 0;
    g_silence_counter = 0;
    g_is_speech = false;
    ESP_LOGI(TAG, "VAD init: threshold=%.4f, trigger=%d frames, release=%d frames",
             threshold, frames_to_trigger, frames_to_release);
}

static float compute_energy(const int16_t *samples, int count)
{
    if (count == 0) return 0.0f;
    int64_t sum = 0;
    for (int i = 0; i < count; i++) {
        sum += abs(samples[i]);
    }
    return (float)(sum / count) / 32768.0f;
}

vad_result_t vad_process(const int16_t *samples, int sample_count)
{
    float energy = compute_energy(samples, sample_count);

    if (energy > g_threshold) {
        g_speech_counter++;
        g_silence_counter = 0;

        if (!g_is_speech && g_speech_counter >= g_frames_to_trigger) {
            g_is_speech = true;
            ESP_LOGI(TAG, "VAD: SPEECH detected (energy=%.4f)", energy);
            return VAD_SPEECH;
        }
    } else {
        g_silence_counter++;

        if (g_is_speech && g_silence_counter >= g_frames_to_release) {
            g_is_speech = false;
            g_speech_counter = 0;
            ESP_LOGI(TAG, "VAD: SILENCE (energy=%.4f)", energy);
            return VAD_SILENCE;
        }
    }

    return g_is_speech ? VAD_SPEECH : VAD_HANGOVER;
}
