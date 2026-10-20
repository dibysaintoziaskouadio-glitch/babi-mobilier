# Image de production du site (apps/web) pour Google Cloud Run.
# Construite depuis la racine du monorepo : docker build -t babi-web .

FROM node:20-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
RUN npm ci
COPY . .
RUN npx prisma generate --schema database/schema.prisma
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-bookworm-slim AS run
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=8080
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
# Moteur Prisma : copié explicitement au cas où le traçage de Next l'oublierait.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
USER node
EXPOSE 8080
CMD ["node", "apps/web/server.js"]
