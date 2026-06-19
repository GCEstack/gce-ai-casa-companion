from deepgram import LiveTranscriptionEvents
print([a for a in dir(LiveTranscriptionEvents) if not a.startswith('_')])
