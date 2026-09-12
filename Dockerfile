FROM node:22-bookworm-slim
WORKDIR /opt/flowwitness
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npx playwright install --with-deps chromium
COPY . .
ENV HOST=0.0.0.0 PORT=4310 FLOWWITNESS_DATA_DIR=/data
EXPOSE 4310
VOLUME ["/data"]
CMD ["node", "bin/flowwitness.mjs", "serve"]
