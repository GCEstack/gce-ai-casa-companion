import os
key = os.environ.get('SUPABASE_SERVICE_KEY', '')
print('LEN', len(key))
for i in range(0, len(key), 80):
    print(key[i:i+80])
