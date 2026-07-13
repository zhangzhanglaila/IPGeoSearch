FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY . .

EXPOSE 8787

CMD ["python", "api.py", "--host", "0.0.0.0", "--port", "8787"]
