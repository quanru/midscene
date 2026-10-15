import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';
import { writeCliScreenshotFile } from '../../src/cli/screenshot-file';

describe('CLI screenshot file names', () => {
  let directoryPath: string;
  const firstImage = readFileSync(join(__dirname, '../fixtures/2x2.png'));
  const secondImage = readFileSync(join(__dirname, '../fixtures/icon.png'));

  beforeEach(() => {
    directoryPath = mkdtempSync(join(tmpdir(), 'midscene-screenshot-names-'));
    rs.spyOn(Date, 'now').mockReturnValue(1700000000000);
  });

  afterEach(() => {
    rs.restoreAllMocks();
    rmSync(directoryPath, { recursive: true, force: true });
  });

  it('keeps both images when saves share the same millisecond', () => {
    const firstPath = writeCliScreenshotFile(firstImage.toString('base64'), {
      directoryPath,
    });
    const secondPath = writeCliScreenshotFile(secondImage.toString('base64'), {
      directoryPath,
    });

    expect(firstPath).not.toBe(secondPath);
    expect(readFileSync(firstPath)).toEqual(firstImage);
    expect(readFileSync(secondPath).equals(secondImage)).toBe(true);
  });

  it('does not drop the second image when overwrite is disabled', () => {
    const options = {
      directoryPath,
      overwrite: false,
      filenamePrefix: 'frame',
    };
    const firstPath = writeCliScreenshotFile(
      firstImage.toString('base64'),
      options,
    );
    const secondPath = writeCliScreenshotFile(
      secondImage.toString('base64'),
      options,
    );

    expect(readFileSync(secondPath).equals(secondImage)).toBe(true);
    expect(readFileSync(firstPath)).toEqual(firstImage);
    expect(firstPath).not.toBe(secondPath);
  });

  it('preserves explicit IDs and their overwrite behavior', () => {
    const options = { directoryPath, id: 'stable-shot' };
    const filePath = writeCliScreenshotFile(
      firstImage.toString('base64'),
      options,
    );

    expect(filePath).toBe(join(directoryPath, 'stable-shot.png'));
    expect(
      writeCliScreenshotFile(secondImage.toString('base64'), {
        ...options,
        overwrite: false,
      }),
    ).toBe(filePath);
    expect(readFileSync(filePath)).toEqual(firstImage);

    expect(
      writeCliScreenshotFile(secondImage.toString('base64'), options),
    ).toBe(filePath);
    expect(readFileSync(filePath)).toEqual(secondImage);
  });
});
