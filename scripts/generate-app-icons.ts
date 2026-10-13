import { mkdir, readFile, writeFile } from 'node:fs/promises'

import sharp from 'sharp'

const source = await readFile(new URL('../apps/site/public/icon.svg', import.meta.url), 'utf8')
const iconSizes = [72, 96, 128, 144, 152, 192, 384, 512]
const pngExports = [
  { name: 'icon.png', size: 512 },
  { name: 'favicon.png', size: 48 },
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  ...iconSizes.map((size) => ({ name: `icons/icon-${size}x${size}.png`, size })),
]

// An opaque square background lets launchers crop the icon to their own shape.
const maskableSource = source.replace('rx="16"', 'rx="0"')
const opaqueExports = [
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'icons/icon-maskable-192x192.png', size: 192 },
  { name: 'icons/icon-maskable-512x512.png', size: 512 },
]
const generatedFiles = [
  { name: 'icon.svg', data: source },
  { name: 'favicon.svg', data: source },
  ...(await Promise.all(
    [
      ...pngExports.map(({ name, size }) => ({ name, size, svg: source })),
      ...opaqueExports.map(({ name, size }) => ({ name, size, svg: maskableSource })),
    ].map(async ({ name, size, svg }) => ({
      name,
      data: await sharp(Buffer.from(svg), { density: 576 }).resize(size, size).png().toBuffer(),
    })),
  )),
]

await Promise.all(
  ['site', 'web'].map(async (app) => {
    const publicDirectory = new URL(`../apps/${app}/public/`, import.meta.url)
    await mkdir(new URL('icons/', publicDirectory), { recursive: true })
    await Promise.all(
      generatedFiles.map(({ name, data }) => writeFile(new URL(name, publicDirectory), data)),
    )
  }),
)
