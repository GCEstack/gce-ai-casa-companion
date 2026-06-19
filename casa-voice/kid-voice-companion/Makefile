.PHONY: install run docker test clean

install:
	cd backend && python -m venv .venv
	cd backend && .venv/Scripts/pip install -e ".[dev]"

run:
	cd backend/src && ..\.venv\Scripts\uvicorn main:app --host 0.0.0.0 --port 8000 --reload

docker:
	docker-compose up --build

test:
	cd backend/src && ..\.venv\Scripts\python -m pytest ../tests

clean:
	cd backend && rmdir /s /q .venv __pycache__ 2>nul || true
