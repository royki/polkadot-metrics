# Use the official Node.js image based on Alpine Linux as the base image
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install the dependencies
RUN npm install

# Copy the rest of the application code to the working directory
COPY . .

# Ensure the config directory exists
RUN mkdir -p /app/config

# Expose the port the app runs on
EXPOSE 8080

# Set the default command to run the application
CMD ["node", "src/app.js", "/app/config/config.yaml"]
