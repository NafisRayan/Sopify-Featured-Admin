import { getStore } from '@/store/useStore'
import { uid } from '@/lib/id'
import { syncMutation, gqlLiteral } from './api'
import { delay } from '@/lib/delay'
import type { Campaign } from '@/types'

/** Marketing service — campaigns are simulated, but still fully manageable. */

export async function createCampaign(input: {
  name: string
  channel: Campaign['channel']
  audience: number
  cost: number
}): Promise<Campaign> {
  await delay(350)
  const campaign: Campaign = {
    id: uid('camp'),
    name: input.name,
    channel: input.channel,
    status: 'draft',
    audience: input.audience,
    reached: 0,
    sessions: 0,
    orders: 0,
    revenue: 0,
    cost: input.cost,
  }
  getStore().addCampaign(campaign)
  syncMutation(`mutation { campaignCreate(campaign: ${gqlLiteral({ name: input.name, channel: input.channel, audience: input.audience, cost: input.cost })}) { userErrors { message } } }`)
  return campaign
}

export async function launchCampaign(id: string): Promise<void> {
  await delay(400)
  const campaign = getStore().campaigns.find((c) => c.id === id)
  if (!campaign) throw new Error('Campaign not found')
  const reached = Math.round(campaign.audience * (0.55 + Math.random() * 0.35))
  const sessions = Math.round(reached * (0.06 + Math.random() * 0.2))
  const orders = Math.round(sessions * (0.01 + Math.random() * 0.07))
  getStore().patchCampaign(id, {
    status: 'active',
    sentAt: new Date().toISOString(),
    reached,
    sessions,
    orders,
    revenue: Math.round(orders * (45 + Math.random() * 70)),
  })
}

export async function completeCampaign(id: string): Promise<void> {
  await delay(300)
  getStore().patchCampaign(id, { status: 'completed' })
}

export async function deleteCampaign(id: string): Promise<void> {
  await delay(300)
  getStore().removeCampaign(id)
}
