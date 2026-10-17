FROM node:26-bookworm-slim

# Xvfb + x11vnc + noVNC: the browser runs on a virtual display the Admin can open to pass the captcha.
RUN apt-get update \
  && apt-get install -y --no-install-recommends xvfb x11vnc novnc websockify tini \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npx playwright install --with-deps chromium && rm -rf /var/lib/apt/lists/*
COPY src ./src
COPY drizzle ./drizzle
COPY docker-entrypoint.sh ./

ENV DISPLAY=:99 DB_PATH=/data/daiteiden.db BROWSER_PROFILE=/data/browser-profile
VOLUME /data
EXPOSE 6080
ENTRYPOINT ["tini", "--", "./docker-entrypoint.sh"]
