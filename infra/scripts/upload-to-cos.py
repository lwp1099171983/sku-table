#!/usr/bin/env python3

import argparse
import os
import sys

from qcloud_cos import CosConfig, CosS3Client


def read_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="上传 PostgreSQL 备份并校验 COS 对象大小")
    parser.add_argument("--file", required=True)
    parser.add_argument("--bucket", required=True)
    parser.add_argument("--region", required=True)
    parser.add_argument("--key", required=True)
    parser.add_argument("--expected-size", required=True, type=int)
    return parser.parse_args()


def main() -> int:
    args = read_arguments()
    secret_id = os.environ.get("COS_SECRET_ID")
    secret_key = os.environ.get("COS_SECRET_KEY")

    if not secret_id or not secret_key:
        print("缺少 COS 凭据。", file=sys.stderr)
        return 2

    if not os.path.isfile(args.file):
        print("备份文件不存在。", file=sys.stderr)
        return 2

    local_size = os.path.getsize(args.file)
    if local_size != args.expected_size or local_size <= 0:
        print("备份文件大小校验失败。", file=sys.stderr)
        return 1

    client = CosS3Client(
        CosConfig(
            Region=args.region,
            SecretId=secret_id,
            SecretKey=secret_key,
            Scheme="https",
        )
    )

    # 单次上传避免引入分块上传权限，当前项目的数据库规模足以满足该方式的限制。
    with open(args.file, "rb") as backup_file:
        client.put_object(Bucket=args.bucket, Key=args.key, Body=backup_file)
    response = client.head_object(Bucket=args.bucket, Key=args.key)
    remote_size = int(response["Content-Length"])

    if remote_size != args.expected_size:
        print("COS 对象大小校验失败。", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        # 不输出 SDK 请求详情，避免日志中包含敏感凭据。
        print(f"COS 上传或校验失败：{error.__class__.__name__}", file=sys.stderr)
        raise SystemExit(1)
