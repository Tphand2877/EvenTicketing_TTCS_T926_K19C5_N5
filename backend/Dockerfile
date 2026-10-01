FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./

RUN npm ci --omit=dev

COPY knexfile.js ./
COPY seeds ./seeds
COPY src ./src
# Script tạo tài khoản demo (admin / organizer / buyer)
COPY scripts ./scripts

EXPOSE 3000

USER node

CMD ["npm", "start"]
