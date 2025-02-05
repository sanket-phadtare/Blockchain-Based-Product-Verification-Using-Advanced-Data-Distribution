# Load Testing with Artillery

## Overview
This project sets up a simple load test using [Artillery](https://www.artillery.io/) to evaluate the `/add` endpoint of a local server running on `http://localhost:5000`. The test sends HTTP POST requests with randomized product details.

## Features
- Uses **Artillery** for load testing
- Sends **1 request per second** for **20 seconds**
- Randomizes `product_id`, `product_name`, and `product_batch`
- Expects a **200 OK** response for successful transactions
- **Currently supports 5-10 successful transactions per run** due to backend limitations

## Prerequisites
Make sure you have the following installed:
- Node.js (v14 or higher recommended)
- Artillery (`npm install -g artillery`)

## Installation
Clone the repository and navigate to the project directory:
```sh
git clone <repository-url>
cd <repository-name>
```

Install dependencies if required:
```sh
npm install
```

## Test Configuration
The load test is configured in `config.yml`:
```yaml
config:
  target: "http://localhost:5000"
  phases:
    - duration: 20  # Run the test for 20 seconds
      arrivalRate: 1 # Send 1 request per second

scenarios:
  - flow:
      - post:
          url: "/add"
          json:
            product_id: "{{ $randomNumber(100000, 999999) }}"
            product_name: "Product-{{ $uuid }}"
            product_batch: "Batch-{{ $randomNumber(1, 100) }}"
          expect:
            - statusCode: 200
```

## Running the Load Test
To execute the test, run:
```sh
artillery run config.yml
```

## Expected Behavior
- The test will send 20 requests over 20 seconds.
- Due to system constraints, only **5-10 transactions** may succeed.
- Failed requests may indicate server rate limits or processing limitations.

## Notes
- Modify `arrivalRate` or `duration` to adjust test intensity.
- Check the backend server logs for failures.


