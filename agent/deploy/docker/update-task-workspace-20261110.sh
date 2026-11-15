#!/usr/bin/env bash
# Run on the existing Silicon Valley ECS. Never prints environment credentials.
set -Eeuo pipefail
umask 077
IMAGE='aed-acr-registry.cn-hangzhou.cr.aliyuncs.com/spur/spur-agent@sha256:de084ee5255de3c6780788fa0015919a7eabb0539a169c5423983c9b3950f461'
NAME=spur-agent-ecs-smoke
OLD="spur-agent-before-task-workspace-$(date +%Y%m%d-%H%M%S)"
BACKUP="/root/spur-agent-upgrade/$OLD"
test -f /root/spur-agent-upgrade/agent.env
test -f /root/seccomp-playwright.json
docker inspect "$NAME" >/dev/null
docker pull "$IMAGE"
mkdir -p "$BACKUP"
chmod 700 "$BACKUP"
docker inspect "$NAME" > "$BACKUP/container.json"
# Private metadata backup above contains env values. Do not paste its contents.
RENAMED=0
rollback() {
  trap - ERR
  set +e
  if [ "$RENAMED" = 1 ]; then
    docker rm -f "$NAME" >/dev/null 2>&1
    docker rename "$OLD" "$NAME" && docker start "$NAME"
  else
    docker start "$NAME"
  fi
  echo 'UPDATE_FAILED：已尝试恢复旧容器，请核对健康状态。私有备份：'"$BACKUP"
  exit 1
}
trap rollback ERR
docker stop "$NAME"
docker rename "$NAME" "$OLD"
RENAMED=1
docker run --rm --user 0 --entrypoint tar \
  -v spur-agent-ecs-runtime:/data:ro -v "$BACKUP":/backup \
  "$IMAGE" -C /data -czf /backup/runtime.tar.gz .
docker run -d --name "$NAME" --restart unless-stopped \
  --platform linux/amd64 --shm-size=1g \
  --security-opt seccomp=/root/seccomp-playwright.json \
  --env-file /root/spur-agent-upgrade/agent.env \
  -p 127.0.0.1:4173:4173 \
  -v spur-agent-ecs-runtime:/opt/spur/V2/web/.runtime "$IMAGE"
docker exec "$NAME" node -e '
(async()=>{
  for(let i=0;i<30;i++){
    try {
      const r=await fetch("http://127.0.0.1:4173/api/creator-agent/health",{
        headers:{Authorization:"Bearer "+process.env.SPUR_CREATOR_AGENT_TOKEN},
        signal:AbortSignal.timeout(3000)
      });
      const h=await r.json();
      if(r.ok && h.status==="ready" && h.authConfigured && h.emailConfigured){
        console.log("WORKSPACE_AGENT_HEALTH_OK"); return;
      }
    } catch {}
    await new Promise(resolve=>setTimeout(resolve,2000));
  }
  process.exitCode=1;
})().catch(()=>{process.exitCode=1});
'
trap - ERR
echo WORKSPACE_AGENT_UPDATE_OK
echo "回滚容器：$OLD"
echo "私有备份：$BACKUP"
