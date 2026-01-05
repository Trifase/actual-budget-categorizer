FROM node:20-alpine

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 py3-pip make g++

# Install Python ML dependencies
RUN pip3 install --break-system-packages scikit-learn joblib

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code and trainer
COPY src/ ./src/
COPY trainer/ ./trainer/
COPY config.json ./

# Run the script
CMD ["node", "src/index.js"]
