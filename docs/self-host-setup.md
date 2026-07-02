# Self-host: Whisper + Ollama — krok po kroku

Jeden serwer obsługuje **wszystkie** podmioty SaaS. Płacisz stały koszt maszyny,
zero opłat za minutę/token, dane z posiedzeń nie wychodzą na zewnątrz.

## 0. Serwer

- **Rekomendacja:** VPS/dedyk z **GPU** (NVIDIA) — Whisper `large-v3` i Bielik
  chodzą szybko. Bez GPU też działa (CPU), ale wolniej (kilka–kilkanaście s/dokument).
- Orientacyjnie: 8+ vCPU, 16–32 GB RAM; GPU 8–12 GB VRAM w zupełności wystarcza.
- System: Ubuntu 22.04+. Otwórz porty tylko dla reverse-proxy (443), nie 8000/11434 na świat.

## 1. Docker

```bash
curl -fsSL https://get.docker.com | sh
# GPU (opcjonalnie): NVIDIA Container Toolkit
sudo apt-get install -y nvidia-container-toolkit && sudo systemctl restart docker
```

## 2. Whisper (transkrypcja) — `faster-whisper-server`

```bash
# GPU:
docker run -d --name whisper --restart unless-stopped --gpus all -p 8000:8000 \
  fedirz/faster-whisper-server:latest-cuda
# CPU:
docker run -d --name whisper --restart unless-stopped -p 8000:8000 \
  fedirz/faster-whisper-server:latest-cpu
```

Endpoint (OpenAI-compatible): `http://<host>:8000/v1/audio/transcriptions`.
Model pobiera się przy pierwszym użyciu; po polsku najlepszy `large-v3`
(ustawisz przez `WHISPER_MODEL`, np. `Systran/faster-whisper-large-v3`).

Test:
```bash
curl -s http://localhost:8000/v1/audio/transcriptions \
  -F file=@nagranie.mp3 -F model=Systran/faster-whisper-large-v3 -F language=pl -F response_format=text
```

## 3. Ollama (asystent AI)

```bash
docker run -d --name ollama --restart unless-stopped --gpus all \
  -p 11434:11434 -v ollama:/root/.ollama ollama/ollama   # bez GPU: pomiń --gpus all

# Model po polsku (zalecany Bielik) — lub uniwersalny:
docker exec -it ollama ollama pull SpeakLeash/bielik-11b-v2.3-instruct:Q4_K_M
docker exec -it ollama ollama pull llama3.1
```

Endpoint (OpenAI-compatible): `http://<host>:11434/v1/chat/completions`.

Test:
```bash
curl -s http://localhost:11434/v1/chat/completions -H 'Content-Type: application/json' \
  -d '{"model":"llama3.1","messages":[{"role":"user","content":"Napisz jedno zdanie po polsku."}]}'
```

## 4. HTTPS + ochrona (reverse proxy)

Wystaw oba pod domenami z certyfikatem (Caddy robi to automatycznie). `Caddyfile`:

```
whisper.twoj-serwer.pl {
  reverse_proxy localhost:8000
}
ai.twoj-serwer.pl {
  reverse_proxy localhost:11434
}
```

Zalecane: dodaj prosty **bearer token** (np. w Caddy `@auth header Authorization "Bearer TWOJ_SEKRET"`
+ `respond 401` dla braku) i ustaw go w aplikacji jako `WHISPER_API_TOKEN` / `LLM_API_TOKEN`.
Wołają je tylko backendy — nie przeglądarka.

## 5. Aplikacja (Vercel → Settings → Environment Variables)

```
WHISPER_API_URL=https://whisper.twoj-serwer.pl/v1/audio/transcriptions
WHISPER_MODEL=Systran/faster-whisper-large-v3
# WHISPER_API_TOKEN=TWOJ_SEKRET

LLM_API_URL=https://ai.twoj-serwer.pl/v1/chat/completions
LLM_MODEL=SpeakLeash/bielik-11b-v2.3-instruct:Q4_K_M
# LLM_API_TOKEN=TWOJ_SEKRET
```

Kliknij **Redeploy**. Gotowe:
- Protokół → „Wgraj nagranie" (Whisper) i „Ulepsz (AI)" (Ollama, **na żywo**).
- Uchwała → „Sformatuj treść (AI)" (na żywo) i „Przetłumacz na EN (AI)".

## 6. Uwagi
- **Limit uploadu:** audio idzie przez trasę Next na Vercelu (~4,5 MB) — wgrywaj
  krótkie/skompresowane fragmenty. Bezpośredni upload do serwera Whisper = dalej.
- **AI to szkic:** wynik zawsze przegląda i zatwierdza protokolant/Przewodniczący.
- **Aktualizacja modeli:** `docker exec -it ollama ollama pull <model>`; restart kontenerów `docker restart whisper ollama`.
