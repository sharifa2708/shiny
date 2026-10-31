FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# fetch the speech model while building, so the first hunt does not have to
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('base.en', device='cpu', compute_type='int8')"
COPY . .
ENV PYTHONUNBUFFERED=1
CMD ["python", "server.py"]
