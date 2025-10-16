FROM python:3.11-slim
WORKDIR /app
COPY ./services/circuit-agent-py /app
RUN pip install --no-cache-dir -r requirements.txt
EXPOSE 4001
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "4001"]
