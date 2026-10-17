FROM node:26-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npx playwright install --with-deps chromium && rm -rf /var/lib/apt/lists/*
COPY src ./src
COPY drizzle ./drizzle

ENV DB_PATH=/data/daiteiden.db BROWSER_PROFILE=/data/browser-profile
VOLUME /data
ENTRYPOINT ["tini", "--", "node", "src/main.ts"]
