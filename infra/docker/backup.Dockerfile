FROM python:3.12-alpine3.22

RUN apk add --no-cache postgresql16-client \
  && pip install --no-cache-dir cos-python-sdk-v5==1.9.44

RUN apk add --no-cache bash

COPY infra/scripts/backup-to-cos.sh /usr/local/bin/backup-to-cos
COPY infra/scripts/upload-to-cos.py /usr/local/bin/upload-to-cos.py

RUN chmod 755 /usr/local/bin/backup-to-cos /usr/local/bin/upload-to-cos.py

ENTRYPOINT ["/usr/local/bin/backup-to-cos"]
