import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { fail, mockFetch, ok, type RouteHandler } from '../test/fetchMock'
import { renderRoute } from '../test/renderRoute'
import { MerchantEntryPage } from './MerchantEntryPage'

const STORAGE_KEY = 'travelpay.recentMerchants'
const MERCHANT_ID = '9b2f3c1e-8a47-4d55-b0c2-7e1f6a9d3b10'
const BALANCE_PATH = `/api/v1/payments/merchants/${MERCHANT_ID}/balance`

function stored(): { merchantId: string; currency: string }[] {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
}

function setup(routes: Record<string, RouteHandler> = {}) {
  const api = mockFetch(routes)
  renderRoute('/merchant', <MerchantEntryPage />, '/merchant')
  return api
}

async function open(id: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText(/가맹점 ID/), id)
  await user.click(screen.getByRole('button', { name: '열기' }))
}

describe('MerchantEntryPage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('잔액 조회로 주인임을 확인하면 최근 가맹점에 기억하고 가맹점 화면으로 이동한다', async () => {
    const api = setup({ [`GET ${BALANCE_PATH}`]: () => ok({ merchantId: MERCHANT_ID, currency: 'KRW', balance: 0 }) })

    await open(MERCHANT_ID)

    expect(await screen.findByTestId('navigated')).toBeInTheDocument()
    expect(api.calls('GET', BALANCE_PATH)).toHaveLength(1)
    expect(stored()).toEqual([{ merchantId: MERCHANT_ID, currency: 'KRW' }])
  })

  it('주인이 아니면(404) 안내 문구를 보여 주고 기억하지 않는다', async () => {
    setup({ [`GET ${BALANCE_PATH}`]: () => fail(404, 'PAYMENT_MERCHANT_NOT_FOUND') })

    await open(MERCHANT_ID)

    expect(
      await screen.findByText('가맹점을 찾을 수 없습니다. 내가 주인인 가맹점의 ID인지 확인해 주세요.'),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('navigated')).not.toBeInTheDocument()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('UUID 형식이 아니면 요청하지 않는다', async () => {
    const api = setup()

    await open('not-a-merchant')

    expect(await screen.findByText(/가맹점 ID 형식이 아닙니다/)).toBeInTheDocument()
    expect(api.requests).toHaveLength(0)
  })

  it('최근 가맹점은 새로 연 것을 맨 앞에 두고 중복 없이 5개까지만 남긴다', async () => {
    const old = Array.from({ length: 5 }, (_, i) => ({
      merchantId: `00000000-0000-4000-8000-00000000000${i}`,
      currency: 'KRW',
    }))
    // 대소문자만 다른 같은 ID는 중복으로 본다.
    old[2] = { merchantId: MERCHANT_ID.toUpperCase(), currency: 'KRW' }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(old))
    setup({ [`GET ${BALANCE_PATH}`]: () => ok({ merchantId: MERCHANT_ID, currency: 'JPY', balance: 0 }) })

    expect(screen.getAllByRole('button', { name: '목록에서 빼기' })).toHaveLength(5)
    await open(MERCHANT_ID)
    await screen.findByTestId('navigated')

    expect(stored()).toEqual([
      { merchantId: MERCHANT_ID, currency: 'JPY' },
      old[0],
      old[1],
      old[3],
      old[4],
    ])
  })

  it('목록에서 빼기를 누르면 화면과 저장소에서 지운다', async () => {
    const user = userEvent.setup()
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ merchantId: MERCHANT_ID, currency: 'KRW' }]))
    setup()

    expect(screen.getByRole('link', { name: MERCHANT_ID })).toHaveAttribute('href', `/merchant/${MERCHANT_ID}`)
    await user.click(screen.getByRole('button', { name: '목록에서 빼기' }))

    expect(screen.queryByText('최근 연 가맹점')).not.toBeInTheDocument()
    expect(stored()).toEqual([])
  })
})
