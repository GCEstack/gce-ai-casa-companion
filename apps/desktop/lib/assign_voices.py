import re

path = "characters.ts"

mapping = {
    "corvo": "N2lVS1w4EtoT3dr4eOWO",
    "gufo": "pqHfZKP75CvOlQylNhV4",
    "orsetto": "nPczCjzI2devNBz1zQrb",
    "coniglio": "cgSgspJ2msm6clMCkdW9",
    "tartaruga": "bIHbv24MWmeRgasZH58o",
    "elefante": "JBFqnCBsd6RMkjVDRZzb",
    "leone": "pNInz6obpgDQGcFmaJgB",
    "delfino": "FGY2WhTYpPnrIDTdsKH5",
    "drago": "IKne3meq5aSn9XLyUdCD",
    "xolo": "iP95p4xoKVk53GoZ742B",
    "scheletro": "onwK4e9ZLuTAKqWW03F9",
    "ragno": "Xb7hH8MSUJpSbSDYk0k2",
    "veloce": "TX3LPaxmHKxFdv7VOQHJ",
    "stellino": "Xb7hH8MSUJpSbSDYk0k2",
    "sacco": "JBFqnCBsd6RMkjVDRZzb",
    "spugna": "EXAVITQu4vr4xnSDxMaL",
    "rocco": "SOYHLrjzK2X1ezoPC6cr",
    "vinile": "Yg1LMMMKIZnepfULKjaF",
    "battito": "SAz9YHcvj6GT2YYXdXww",
    "onda": "pFZP5JQG7iQjIQuC4Bku",
    "maestra": "Xb7hH8MSUJpSbSDYk0k2",
    "costruttore": "nPczCjzI2devNBz1zQrb",
    "dottore": "hpp4J3VqNfWAUOO0d1Us",
    "pietro": "iP95p4xoKVk53GoZ742B",
    "borsa": "cjVigY5qzO86Huf0OWal",
    "mamma": "EXAVITQu4vr4xnSDxMaL",
    "verita": "onwK4e9ZLuTAKqWW03F9",
    "forza": "TX3LPaxmHKxFdv7VOQHJ",
    "bella": "pFZP5JQG7iQjIQuC4Bku",
    "cuoco": "IKne3meq5aSn9XLyUdCD",
    "nonna": "EXAVITQu4vr4xnSDxMaL",
    "cucita": "pFZP5JQG7iQjIQuC4Bku",
    "polpo": "SAz9YHcvj6GT2YYXdXww",
}

with open(path, "r", encoding="utf-8") as f:
    text = f.read()

# Add field to interface
interface_old = "export interface Character {\n  key: string;\n  name: string;\n  meaning: string;\n  voice: string;\n  realtimeVoice: string;\n  prompt: string;\n  image: string;\n}"
interface_new = """export interface Character {
  key: string;
  name: string;
  meaning: string;
  voice: string;
  realtimeVoice: string;
  elevenlabs_voice_id?: string;
  prompt: string;
  image: string;
}"""
text = text.replace(interface_old, interface_new)

# Insert elevenlabs_voice_id after realtimeVoice for each character

def replacer(match):
    key = match.group(1)
    voice_id = mapping.get(key)
    if voice_id:
        return match.group(0) + f'\n    elevenlabs_voice_id: "{voice_id}",'
    return match.group(0)

# Match from key line up through realtimeVoice line
pattern = re.compile(r'(?m)^\s+key:\s*"([^"]+)",\n\s+name:\s*"[^"]+",\n\s+meaning:\s*"[^"]+",\n\s+voice:\s*"[^"]+",\n\s+realtimeVoice:\s*"[^"]+",')
text = pattern.sub(replacer, text)

with open(path, "w", encoding="utf-8") as f:
    f.write(text)

print("assigned voices")
