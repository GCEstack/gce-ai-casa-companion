/* vad.h — Energy-based Voice Activity Detection with Hysteresis
 *
 * Threshold: 0.025 (raised from 0.015 for noisy home environments)
 * Hysteresis: 3 consecutive frames above threshold to trigger
 *              10 consecutive frames below to release
 *
 * This is the PRE-GATE. Real VAD runs on backend (Silero).
 * Goal: reduce false triggers + save Wi-Fi bandwidth.
 */

#ifndef VAD_H
#define VAD_H

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    VAD_SILENCE = 0,
    VAD_SPEECH = 1,
    VAD_HANGOVER = 2,  /* in release window */
} vad_result_t;

void vad_init(float threshold, int frames_to_trigger, int frames_to_release);
vad_result_t vad_process(const int16_t *samples, int sample_count);

#ifdef __cplusplus
}
#endif

#endif /* VAD_H */
