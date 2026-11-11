FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY src ./src
RUN ./node_modules/.bin/esbuild src/index.ts --bundle --platform=node --target=node24 --format=esm --packages=external --outfile=dist/index.js

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY --from=deps /app/dist ./dist
RUN mkdir data && chown node:node data
ENTRYPOINT ["sh","-ec","chown node:node /app/data && exec setpriv --reuid=node --regid=node --init-groups \"$@\"", "--"]
CMD ["node","dist/index.js"]
