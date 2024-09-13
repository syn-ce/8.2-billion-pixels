FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt requirements.txt
RUN pip install -r requirements.txt

COPY app app

CMD ["gunicorn", "--config", "gunicorn_config.py", "--log-level=info", "--reload", "app:app"]