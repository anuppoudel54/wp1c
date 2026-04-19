## Project Info

Provide a name, and it sets up a website accessible at 'name.wp.local'.

## Project Setup

Follow these steps to set up and run the project on your local machine:

### Prerequisites

Before proceeding with the setup, ensure that you have the following installed:

- Docker

### Steps

1. **Clone the Repository**

   ```bash
   git clone https://github.com/anuppoudel54/wp1c.git
   cd w1pc
   cp .env.example .env
   docker compose up -d
   ```

2. **Access Dashboard & User Management**

   Open your browser and navigate to `http://localhost:3000`. You will be presented with a premium dashboard where you can register an account, log in, and manage your containers.

3. **Create container (via Dashboard or API)**

   ```
    curl -X POST -H "Content-Type: application/json" -d '{"hostname":"name"}' localhost:3000/create-container
   ```

   Replace "name" with your desired container name.
   
   *Under the hood, this `/create-container` API route is defined in `routes.js` and handled by the `createContainer()` method in `controllers/containerController.js`. It orchestrates the process by calling `createDockerInstance()` from `utils/dockerUtils.js` to spin up the actual Docker containers.*

3. **Access wordpress site**

   Once the container is created, open your browser and navigate to http://name.wp.local. You should see the WordPress site. Replace name with your container name

## Notes

- Ensure to edit your `/etc/hosts` file to map `name.wp.local` to `localhost`.
- A wildcard `*.wp.local` is not supported in the `/etc/hosts` file.
