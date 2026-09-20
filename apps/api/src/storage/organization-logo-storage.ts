import { randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3'
import type { ServerConfig } from '@reviewinbox/config'

const uploadPrefix = 'organization-logos'

type LogoStorage = {
  put(input: {
    organizationId: string
    bytes: Uint8Array
    contentType: string
    extension: string
  }): Promise<string>
  deleteByUrl(url: string | null | undefined): Promise<void>
}

export function createOrganizationLogoStorage(config: ServerConfig): LogoStorage {
  if (
    hasText(config.s3Region)
    && hasText(config.s3Bucket)
    && hasText(config.s3AccessKeyId)
    && hasText(config.s3SecretAccessKey)
  ) {
    return new S3OrganizationLogoStorage(config)
  }

  return new LocalOrganizationLogoStorage(config)
}

class LocalOrganizationLogoStorage implements LogoStorage {
  constructor(private readonly config: ServerConfig) {}

  async put(input: {
    organizationId: string
    bytes: Uint8Array
    contentType: string
    extension: string
  }): Promise<string> {
    const key = `${randomUUID()}.${input.extension}`
    const directory = join(this.config.uploadLocalDir, uploadPrefix)
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, key), input.bytes)

    return new URL(`/api/uploads/${uploadPrefix}/${key}`, this.config.betterAuthUrl).toString()
  }

  async deleteByUrl(url: string | null | undefined): Promise<void> {
    if (url === null || url === undefined || url === '') {
      return
    }

    const parsedUrl = new URL(url)
    if (parsedUrl.origin !== new URL(this.config.betterAuthUrl).origin) {
      return
    }

    const expectedPrefix = `/api/uploads/${uploadPrefix}/`
    if (!parsedUrl.pathname.startsWith(expectedPrefix)) {
      return
    }

    await rm(join(this.config.uploadLocalDir, uploadPrefix, basename(parsedUrl.pathname)), {
      force: true,
    })
  }
}

class S3OrganizationLogoStorage implements LogoStorage {
  private readonly client: S3Client

  constructor(private readonly config: ServerConfig) {
    if (
      !hasText(config.s3Region)
      || !hasText(config.s3AccessKeyId)
      || !hasText(config.s3SecretAccessKey)
    ) {
      throw new Error('S3 storage requires region and credentials.')
    }

    const clientConfig: S3ClientConfig = {
      region: config.s3Region,
      credentials: { accessKeyId: config.s3AccessKeyId, secretAccessKey: config.s3SecretAccessKey },
    }

    if (hasText(config.s3Endpoint)) {
      clientConfig.endpoint = config.s3Endpoint
    }

    this.client = new S3Client(clientConfig)
  }

  async put(input: {
    organizationId: string
    bytes: Uint8Array
    contentType: string
    extension: string
  }): Promise<string> {
    const key = `${uploadPrefix}/${randomUUID()}.${input.extension}`

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.s3Bucket,
        Key: key,
        Body: input.bytes,
        ContentType: input.contentType,
      }),
    )

    if (hasText(this.config.s3PublicBaseUrl)) {
      return new URL(key, `${this.config.s3PublicBaseUrl.replace(/\/$/u, '')}/`).toString()
    }

    return `https://${this.config.s3Bucket}.s3.${this.config.s3Region}.amazonaws.com/${key}`
  }

  async deleteByUrl(url: string | null | undefined): Promise<void> {
    const key = this.keyFromUrl(url)
    if (key === null) {
      return
    }

    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.s3Bucket, Key: key }))
  }

  private keyFromUrl(url: string | null | undefined): string | null {
    if (url === null || url === undefined || url === '') {
      return null
    }

    const parsedUrl = new URL(url)
    if (parsedUrl.origin !== this.publicBaseUrl().origin) {
      return null
    }

    const key = parsedUrl.pathname.replace(/^\//u, '')
    return key.startsWith(`${uploadPrefix}/`) ? key : null
  }

  private publicBaseUrl(): URL {
    if (hasText(this.config.s3PublicBaseUrl)) {
      return new URL(this.config.s3PublicBaseUrl)
    }

    return new URL(`https://${this.config.s3Bucket}.s3.${this.config.s3Region}.amazonaws.com`)
  }
}

function hasText(value: string | null | undefined): value is string {
  return value !== undefined && value !== null && value !== ''
}
