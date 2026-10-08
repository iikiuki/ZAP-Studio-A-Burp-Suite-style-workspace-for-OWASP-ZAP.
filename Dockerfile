# OWASP ZAP (the scanning engine this app drives).
# We borrow the engine + its bundled JRE from the official image rather than
# installing ZAP ourselves, so the version always matches a tested release.
FROM ghcr.io/zaproxy/zaproxy:stable AS zap

# ---- frontend build ----
FROM node:22-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ---- runtime ----
FROM python:3.13-slim
ENV DEBIAN_FRONTEND=noninteractive \
    JAVA_HOME=/opt/java/openjdk \
    ZAP_PATH=/opt/zaproxy/zap.sh \
    PATH=/opt/java/openjdk/bin:/opt/zaproxy:$PATH

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl bash \
 && rm -rf /var/lib/apt/lists/*

# Copy the JRE and the ZAP distribution from the official image.
COPY --from=zap /usr/lib/jvm/java-17-openjdk-amd64 /opt/java/openjdk
COPY --from=zap /zap /opt/zaproxy

WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ backend/
COPY --from=frontend /app/frontend/dist frontend/dist

ENV BURPZAP_HOME=/data \
    BURPZAP_ZAP_PORT=8090 \
    BURPZAP_PORT=8070 \
    BURPZAP_HOST=0.0.0.0

VOLUME ["/data"]
EXPOSE 8070 8080 8090

HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --retries=5 \
  CMD curl -fsS http://127.0.0.1:8070/api/health || exit 1

CMD ["uvicorn", "app.main:app", "--app-dir", "backend", "--host", "0.0.0.0", "--port", "8070"]
