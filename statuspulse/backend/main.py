from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from enum import Enum
from datetime import datetime, timezone

app = FastAPI(title="StatusPulse API")

# CORS: the browser will block the Next.js frontend from calling this API
# unless we explicitly allow its origin. This is a browser security rule.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://172.29.192.1:3000"],  # the Next.js dev server
    allow_methods=["*"],
    allow_headers=["*"],
)

class StatusEnum(str, Enum):
    operational = "operational"
    degraded = "degraded"
    down = "down"

class Service(BaseModel):          # this is our "common format" (the normalizer's target)
    id: str
    name: str
    status: StatusEnum
    last_updated: datetime

# In-memory store = stand-in for the DB+cache for now. Not durable; that's fine today.
SERVICES: dict[str, Service] = {
    "jira":   Service(id="jira",   name="Jira",   status=StatusEnum.operational, last_updated=datetime.now(timezone.utc)),
    "github": Service(id="github", name="GitHub", status=StatusEnum.operational, last_updated=datetime.now(timezone.utc)),
    "email":  Service(id="email",  name="Email",  status=StatusEnum.degraded,    last_updated=datetime.now(timezone.utc)),
}

@app.get("/health")            # liveness probe — every prod service needs one (ALB/ECS will hit this)
def health():
    return {"status": "ok"}

@app.get("/services", response_model=list[Service])
def list_services():
    return list(SERVICES.values())

@app.get("/services/{service_id}", response_model=Service)
def get_service(service_id: str):
    if service_id not in SERVICES:
        raise HTTPException(status_code=404, detail="Service not found")
    return SERVICES[service_id]

# This is the WEBHOOK. A monitoring tool POSTs here when status changes.
class WebhookPayload(BaseModel):
    service_id: str
    status: StatusEnum

@app.post("/webhook/status", status_code=201)
def receive_webhook(payload: WebhookPayload):
    # In the real system this is where the NORMALIZER lives and we'd publish
    # to the message bus. For now we update the store directly.
    svc = SERVICES.get(payload.service_id)
    if not svc:
        # auto-register unknown services so monitoring can introduce new ones
        svc = Service(id=payload.service_id, name=payload.service_id.title(),
                      status=payload.status, last_updated=datetime.now(timezone.utc))
    else:
        svc.status = payload.status
        svc.last_updated = datetime.now(timezone.utc)
    SERVICES[payload.service_id] = svc
    return {"received": True, "service": svc}
