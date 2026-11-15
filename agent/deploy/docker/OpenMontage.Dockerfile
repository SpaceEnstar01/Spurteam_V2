# Prepared allowlisted context, created by prepare-openmontage-context.py.
FROM spur-agent:research-async-v3
USER 0:0
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg python3-venv fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.lock /tmp/openmontage-requirements.lock
RUN python3 -m venv /opt/openmontage-venv \
    && /opt/openmontage-venv/bin/pip install --no-cache-dir --timeout 90 -r /tmp/openmontage-requirements.lock \
    && /opt/openmontage-venv/bin/pip check
COPY --chown=10001:10001 OpenMontage/ /opt/spur/V2/agent/runtime/OpenMontage-main/
WORKDIR /opt/spur/V2/agent/runtime/OpenMontage-main/remotion-composer
RUN npm ci --include=dev --ignore-scripts --no-audit --no-fund \
    && chown -R 10001:10001 node_modules
COPY --chown=10001:10001 tools/openmontage/ /opt/spur/V2/agent/tools/openmontage/
COPY --chown=10001:10001 tools/video-generation/ /opt/spur/V2/agent/tools/video-generation/
COPY --chown=10001:10001 web/ /opt/spur/V2/web/
COPY --chown=10001:10001 media/ /opt/spur/openmontage-media/
ENV SPUR_OPENMONTAGE_ENABLED=0 \
    SPUR_OPENMONTAGE_ROOT=/opt/spur/V2/agent/runtime/OpenMontage-main \
    SPUR_OPENMONTAGE_PYTHON=/opt/openmontage-venv/bin/python \
    SPUR_OPENMONTAGE_CATALOG=/opt/spur/openmontage-media/catalog.json \
    SPUR_RENDER_CHROME=/usr/bin/google-chrome \
    SPUR_FFMPEG=/usr/bin/ffmpeg \
    SPUR_FFPROBE=/usr/bin/ffprobe
WORKDIR /opt/spur/V2/web
USER 10001:10001
RUN /opt/openmontage-venv/bin/python -c "import sys;sys.path.insert(0,'/opt/spur/V2/agent/runtime/OpenMontage-main');import edge_tts;from tools.video.video_compose import VideoCompose;from lib.checkpoint import init_project;print('OPENMONTAGE_IMPORT_OK')" \
    && test -x /usr/bin/google-chrome \
    && ffmpeg -version >/dev/null
