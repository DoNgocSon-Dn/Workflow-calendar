import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as xlsx from 'xlsx';
import { AiFileImportService } from './ai-file-import.service';
import { BadRequestException } from '@nestjs/common';

function multerFile(name: string, buffer: Buffer): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: name,
    encoding: '7bit',
    mimetype: 'application/octet-stream',
    buffer,
    size: buffer.length,
    stream: null as never,
    destination: '',
    filename: '',
    path: '',
  };
}

describe('AiFileImportService', () => {
  let service: AiFileImportService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiFileImportService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue({ geminiApiKey: '' }),
          },
        },
      ],
    }).compile();

    service = module.get<AiFileImportService>(AiFileImportService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should extract text from a valid PDF file buffer', async () => {
    const pdfHeader =
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 24 Tf 100 700 Td (Test PDF Content) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000270 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n364\n%%EOF';

    const mockFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: 'sample.pdf',
      encoding: '7bit',
      mimetype: 'application/pdf',
      buffer: Buffer.from(pdfHeader, 'binary'),
      size: pdfHeader.length,
      stream: null as any,
      destination: '',
      filename: '',
      path: '',
    };

    const text = await service.extractTextFromFile(mockFile);
    expect(text).toContain('Test PDF Content');
  });

  it('should throw BadRequestException for an invalid PDF file buffer', async () => {
    const mockFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: 'corrupted.pdf',
      encoding: '7bit',
      mimetype: 'application/pdf',
      buffer: Buffer.from('corrupted binary data'),
      size: 21,
      stream: null as any,
      destination: '',
      filename: '',
      path: '',
    };

    await expect(service.extractTextFromFile(mockFile)).rejects.toThrow(BadRequestException);
  });

  it('đọc .xlsx: mỗi sheet thành một khối CSV có nhãn', async () => {
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.aoa_to_sheet([
      ['Môn', 'Thứ', 'Giờ', 'Phòng'],
      ['Toán', 'Hai', '07:00', 'A101'],
      ['Lý', 'Tư', '09:30', 'B203'],
    ]);
    xlsx.utils.book_append_sheet(wb, ws, 'HK1');
    const buffer: Buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const text = await service.extractTextFromFile(multerFile('tkb.xlsx', buffer));
    expect(text).toContain('--- Sheet: HK1 ---');
    expect(text).toContain('Toán,Hai,07:00,A101');
    expect(text).toContain('Lý,Tư,09:30,B203');
  });

  it('đọc .csv thẳng (không đổi hành vi cũ)', async () => {
    const text = await service.extractTextFromFile(
      multerFile('a.csv', Buffer.from('title,start\nHọp,2026-09-01T09:00', 'utf-8')),
    );
    expect(text).toContain('Họp,2026-09-01T09:00');
  });

  it('file .docx hỏng → BadRequestException', async () => {
    await expect(
      service.extractTextFromFile(multerFile('x.docx', Buffer.from('not a real docx'))),
    ).rejects.toThrow(BadRequestException);
  });
});
