import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearCsrfToken } from '../../api'
import { mockFetch, ok } from '../../test/fetchMock'
import { renderRoute } from '../../test/renderRoute'
import { AdminMerchantNewPage } from './AdminMerchantNewPage'

const MERCHANTS = '/api/v1/payments/merchants'
const OWNER_ID = '4ab3e8ac-ad42-4858-8e97-86f0f3107702'

describe('AdminMerchantNewPage', () => {
  beforeEach(() => {
    clearCsrfToken()
  })

  it('입력 화면에서 주인 회원 지갑이 정산보다 먼저 있어야 한다고 안내한다', () => {
    mockFetch({})
    renderRoute('/admin/merchants/new', <AdminMerchantNewPage />, '/admin/merchants/new')

    expect(screen.getByText(/주인 회원이 내 지갑 화면에서 지갑을 먼저 만들어야 정산을 요청할 수 있습니다/)).toBeInTheDocument()
  })

  it('생성 결과 화면에서도 주인 회원 지갑 안내를 보여 준다', async () => {
    const user = userEvent.setup()
    const api = mockFetch({
      [`POST ${MERCHANTS}`]: () =>
        ok(
          {
            merchantId: 'a475d074-0284-46cb-9367-e0f813982171',
            name: '테스트 가맹점',
            currency: 'KRW',
            ownerUserId: OWNER_ID,
            status: 'ACTIVE',
            createdAt: '2026-11-11T00:00:00Z',
          },
          201,
        ),
    })
    renderRoute('/admin/merchants/new', <AdminMerchantNewPage />, '/admin/merchants/new')

    await user.type(screen.getByLabelText('가맹점 이름'), '테스트 가맹점')
    await user.type(screen.getByLabelText(/^주인 회원 ID/), OWNER_ID)
    await user.click(screen.getByRole('button', { name: '가맹점 만들기' }))

    expect(await screen.findByText('가맹점을 만들었습니다. 바로 결제를 받을 수 있습니다.')).toBeInTheDocument()
    expect(screen.getByText(/정산금은 이 회원의 지갑으로 들어갑니다/)).toBeInTheDocument()
    expect(api.calls('POST', MERCHANTS)[0]!.body).toEqual({
      name: '테스트 가맹점',
      currency: 'KRW',
      ownerUserId: OWNER_ID,
    })
  })
})
