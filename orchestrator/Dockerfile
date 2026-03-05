FROM node:22-bookworm-slim

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml nest-cli.json tsconfig.json ./
RUN pnpm install --frozen-lockfile

COPY src ./src
RUN pnpm build

EXPOSE 3000

CMD ["node", "dist/main.js"]

