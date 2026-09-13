import { lookup } from 'node:dns/promises'
import { BlockList, isIP, type LookupFunction } from 'node:net'
import { Agent } from 'undici'

const blockedIpv4 = new BlockList()
const blockedIpv6 = new BlockList()

for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blockedIpv4.addSubnet(network, prefix, 'ipv4')
}

for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
] as const) {
  blockedIpv6.addSubnet(network, prefix, 'ipv6')
}

function remoteUrlError(): Error {
  return new Error('URL remota não permitida.')
}

function isBlocked(address: string): boolean {
  const family = isIP(address)
  if (family === 4) return blockedIpv4.check(address, 'ipv4')
  if (family === 6) return blockedIpv6.check(address, 'ipv6')
  return true
}

export interface PublicRemoteAddress {
  address: string
  family: 4 | 6
}

export function createPinnedRemoteDispatcher(addresses: PublicRemoteAddress[]): Agent {
  if (!addresses.length) throw remoteUrlError()
  const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
    if (options.all) {
      callback(null, addresses)
      return
    }
    const selected = addresses[0]
    callback(null, selected.address, selected.family)
  }
  return new Agent({ connect: { lookup: pinnedLookup, autoSelectFamily: true } })
}

export async function assertPublicHttpsUrl(url: URL): Promise<PublicRemoteAddress[]> {
  if (url.protocol !== 'https:' || url.username || url.password) throw remoteUrlError()
  const rawHostname = url.hostname.toLowerCase().replace(/\.$/, '')
  const hostname = rawHostname.startsWith('[') && rawHostname.endsWith(']')
    ? rawHostname.slice(1, -1)
    : rawHostname
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')) throw remoteUrlError()

  const literalFamily = isIP(hostname)
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily as 4 | 6 }]
    : await lookup(hostname, { all: true, verbatim: true }).catch(() => [])
  if (!addresses.length || addresses.some(result => isBlocked(result.address))) throw remoteUrlError()
  return addresses.map(result => ({ address: result.address, family: result.family as 4 | 6 }))
}
