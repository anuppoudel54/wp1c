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

2. **Create container**

   ```
    curl -X POST -H "Content-Type: application/json" -d '{"hostname":"name"}' localhost:3000/create-container
   ```

   Replace "name" with your desired container name

3. **Access wordpress site**

   Once the container is created, open your browser and navigate to http://name.wp.local. You should see the WordPress site.

## Notes

- Ensure to edit your `/etc/hosts` file to map `name.wp.local` to `localhost`.
- A wildcard `*.wp.local` is not supported in the `/etc/hosts` file.
