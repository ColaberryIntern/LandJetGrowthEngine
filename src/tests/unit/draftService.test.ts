jest.mock('../../models/ScheduledEmail', () => ({
  ScheduledEmail: {
    findOne: jest.fn(),
    findByPk: jest.fn(),
    findAndCountAll: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
  },
  initScheduledEmailModel: jest.fn(),
}));
jest.mock('../../models/Campaign', () => ({ Campaign: { findByPk: jest.fn() }, initCampaignModel: jest.fn() }));
jest.mock('../../models/Lead', () => ({ Lead: { findByPk: jest.fn() }, initLeadModel: jest.fn() }));
jest.mock('../../services/auditLogService', () => ({ createAuditLog: jest.fn() }));
jest.mock('../../config/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import { approveDraft, rejectDraft } from '../../services/draftService';
import { ScheduledEmail } from '../../models/ScheduledEmail';
import { Campaign } from '../../models/Campaign';

const mockFindByPk = ScheduledEmail.findByPk as jest.Mock;
const mockCampaignFind = Campaign.findByPk as jest.Mock;

describe('DraftService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('approveDraft', () => {
    it('should transition draft to approved', async () => {
      const mockDraft = {
        id: 'draft-1', status: 'draft', campaign_id: 'camp-1', metadata: {},
        update: jest.fn(),
      };
      mockFindByPk.mockResolvedValue(mockDraft);
      mockCampaignFind.mockResolvedValue({ status: 'active' });

      const result = await approveDraft('draft-1', 'user-1');

      expect(mockDraft.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved' }));
    });

    it('should reject if status is not draft', async () => {
      mockFindByPk.mockResolvedValue({ id: 'draft-1', status: 'sent', update: jest.fn() });
      await expect(approveDraft('draft-1', 'user-1')).rejects.toThrow('Cannot approve');
    });

    it('should reject if campaign is not active', async () => {
      mockFindByPk.mockResolvedValue({ id: 'draft-1', status: 'draft', campaign_id: 'camp-1', metadata: {}, update: jest.fn() });
      mockCampaignFind.mockResolvedValue({ status: 'paused' });
      await expect(approveDraft('draft-1', 'user-1')).rejects.toThrow('paused');
    });

    it('should throw NotFound if draft missing', async () => {
      mockFindByPk.mockResolvedValue(null);
      await expect(approveDraft('nope', 'user-1')).rejects.toThrow('not found');
    });
  });

  describe('rejectDraft', () => {
    it('should transition draft to cancelled with reason', async () => {
      const mockDraft = { id: 'draft-1', status: 'draft', metadata: {}, update: jest.fn() };
      mockFindByPk.mockResolvedValue(mockDraft);

      await rejectDraft('draft-1', 'user-1', 'Too generic');

      expect(mockDraft.update).toHaveBeenCalledWith(expect.objectContaining({
        status: 'cancelled',
        metadata: expect.objectContaining({ rejection_reason: 'Too generic' }),
      }));
    });

    it('should reject if status is not draft', async () => {
      mockFindByPk.mockResolvedValue({ id: 'draft-1', status: 'approved', update: jest.fn() });
      await expect(rejectDraft('draft-1', 'user-1')).rejects.toThrow('Cannot reject');
    });
  });
});
