# Self-hostowany asystent AI (Ollama)

Aplikacja może „obrabiać" treść przez **self-hostowany LLM** (Ollama lub dowolny
serwer zgodny z OpenAI). Jeden serwer obsługuje wszystkich najemców — stały koszt
maszyny, **zero opłat za token**, dane nie wychodzą do zewnętrznego API.

Co robi asystent (w edytorach):
- **Protokół → „Ulepsz (AI)"**: surowy szkielet/notatki → schludna, formalna proza.
- **Uchwała → „Sformatuj treść (AI)"**: treść w strukturę paragrafów (§), urzędowy język.
- **Uchwała → „Przetłumacz na EN (AI)"**: automatyczne PL→EN (wypełnia wersję angielską).

> ⚠️ AI to **asystent-szkic** — wynik zawsze przegląda i zatwierdza protokolant /
> Przewodniczący. Nie jest ostatecznym autorytetem prawnym.

## 1. Postaw Ollamę

```bash
# CPU (mniejsze modele) lub GPU (--gpus all, szybciej)
docker run -d --name ollama -p 11434:11434 -v ollama:/root/.ollama ollama/ollama

# Pobierz model dobry po polsku:
docker exec -it ollama ollama pull SpeakLeash/bielik-11b-v2.3-instruct:Q4_K_M   # polski (zalecany)
# albo uniwersalne:
docker exec -it ollama ollama pull llama3.1
docker exec -it ollama ollama pull qwen2.5
```

Ollama wystawia endpoint zgodny z OpenAI: `http://<host>:11434/v1/chat/completions`.
Postaw za HTTPS (reverse proxy) i — zalecane — chroń tokenem/allowlistą IP (woła go
tylko backend, nie przeglądarka).

## 2. Skonfiguruj aplikację (Vercel → Environment Variables)

```
LLM_API_URL=https://ai.twoj-serwer.pl/v1/chat/completions
LLM_MODEL=bielik            # nazwa modelu w Twojej Ollamie (np. llama3.1)
# LLM_API_TOKEN=...         # jeśli serwer chroniony bearerem
```

Po **Redeploy** w edytorach pojawiają się działające przyciski AI. Bez `LLM_API_URL`
przyciski grzecznie zgłaszają, że asystent jest nieskonfigurowany.

## Uwagi
- **Model po polsku:** `Bielik` (SpeakLeash) daje najlepszą polszczyznę urzędową;
  `llama3.1`/`qwen2.5` też radzą sobie nieźle.
- **Wydajność:** GPU mocno przyspiesza; na CPU działa, ale wolniej (kilka–kilkanaście
  sekund na dokument).
- **Prywatność:** cała treść zostaje na Twoim serwerze.
