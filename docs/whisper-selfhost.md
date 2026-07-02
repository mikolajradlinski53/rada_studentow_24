# Self-hostowany Whisper (transkrypcja auto-protokołu)

Transkrypcja działa przez **jeden** serwer Whisper, do którego strzela aplikacja.
Jeden serwer obsługuje **wszystkich najemców** SaaS — płacisz stały koszt maszyny,
zero opłat za minutę i zero kluczy per-podmiot.

## 1. Postaw serwer Whisper (OpenAI-compatible)

Najprościej — `faster-whisper-server` / `speaches` (Docker), wystawia
endpoint zgodny z OpenAI `/v1/audio/transcriptions`.

**CPU (mniejszy model, tanio):**
```bash
docker run -d --name whisper -p 8000:8000 \
  fedirz/faster-whisper-server:latest-cpu
```

**GPU (large-v3, szybko i dokładnie po polsku):**
```bash
docker run -d --name whisper --gpus all -p 8000:8000 \
  fedirz/faster-whisper-server:latest-cuda
```

Serwer wystawia `http://<host>:8000/v1/audio/transcriptions`. Postaw za reverse-
proxy z HTTPS (Caddy/Nginx) i — zalecane — chroń tokenem/allowlistą IP, bo
wywołuje go tylko backend aplikacji (nie przeglądarka).

Alternatywy: `whisper.cpp` server, `whisperX`, dowolny serwer z OpenAI-compatible
audio endpoint. Model po polsku: `large-v3` (najlepszy) lub `medium` (lżejszy).

## 2. Skonfiguruj aplikację (Vercel → Environment Variables)

```
WHISPER_API_URL=https://whisper.twoj-serwer.pl/v1/audio/transcriptions
WHISPER_API_TOKEN=...   # opcjonalnie, jeśli serwer chroniony bearerem
WHISPER_MODEL=whisper-1 # opcjonalnie; nazwa modelu wg Twojego serwera (np. large-v3)
```

Po **Redeploy** w edytorze protokołu pojawia się działające „Wgraj nagranie".

## 3. Ograniczenia / uwagi

- **Rozmiar:** audio idzie przez trasę Next na Vercelu, która ma limit ciała
  żądania ~**4,5 MB**. Wgrywaj krótkie/skompresowane fragmenty (np. per punkt
  porządku). Docelowo: upload bezpośrednio do serwera Whisper albo przez Supabase
  Storage (omija limit) — przyszły etap.
- **Prywatność:** nagranie trafia na Twój serwer, nie do zewnętrznego API —
  pełna kontrola nad danymi z posiedzeń.
- **Jakość:** `large-v3` daje najlepszą polszczyznę; nazwiska/żargon i tak wymagają
  korekty protokolanta (transkrypcja = szkic dyskusji, nie finalny protokół).
