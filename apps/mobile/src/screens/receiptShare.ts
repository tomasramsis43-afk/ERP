import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import { ReceiptKind, ReceiptLabels } from '../core/receipts';
import { getLang, t } from '../i18n';

export const kindKey: Record<ReceiptKind, 'receiptCashSale' | 'receiptCreditSale' | 'receiptReturnGood' | 'receiptReturnDamaged' | 'receiptCollection' | 'receiptExpense'> = {
  CASH_SALE: 'receiptCashSale',
  CREDIT_SALE: 'receiptCreditSale',
  RETURN_GOOD: 'receiptReturnGood',
  RETURN_DAMAGED: 'receiptReturnDamaged',
  COLLECTION: 'receiptCollection',
  EXPENSE: 'receiptExpense',
};

export const labels = (): ReceiptLabels => ({
  title: Object.fromEntries((Object.keys(kindKey) as ReceiptKind[]).map((k) => [k, t(kindKey[k])])) as Record<ReceiptKind, string>,
  customer: t('customers'),
  date: t('date'),
  total: t('total'),
  estimate: t('estimate'),
  ref: t('ref'),
});

export const dir = () => (getLang() === 'ar' ? 'rtl' : 'ltr') as 'rtl' | 'ltr';

/** Renders HTML to a PDF file on the device (works offline) and opens the share sheet (print, save, send). */
export async function sharePdf(html: string): Promise<void> {
  try {
    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
    else Alert.alert(t('pdfFailed'));
  } catch {
    Alert.alert(t('pdfFailed'));
  }
}

