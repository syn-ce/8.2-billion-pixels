FROM python:3.12-slim AS development

COPY requirements.txt requirements.txt
RUN pip install -r requirements.txt

COPY app app

WORKDIR /app

CMD ["gunicorn", "--config", "gunicorn_config.py", "--log-level=info", "--reload", "app:app"]

FROM python:3.12-alpine AS production

COPY --from=development requirements.txt requirements.txt
RUN pip install -r requirements.txt

COPY --from=development /app /app

RUN ls

EXPOSE 5000

WORKDIR /app

CMD ["gunicorn", "--config", "gunicorn_config.py", "--log-level=info", "app:app"]