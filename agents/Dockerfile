FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN python -m pip install --no-cache-dir uv

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

ENV PATH=/app/.venv/bin:$PATH

COPY shared ./shared
COPY content_agent ./content_agent
COPY review_agent ./review_agent

CMD ["python", "-m", "content_agent.main"]

