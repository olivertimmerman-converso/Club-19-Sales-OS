import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { XataClient } from '@/src/xata';

const xata = new XataClient();

/**
 * PUT /api/payment-schedule/[id]
 * Update a single payment instalment
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: instalmentId } = await params;
    const body = await req.json();

    // Verify instalment exists
    const instalment = await xata.db.PaymentSchedule.read(instalmentId);
    if (!instalment) {
      return NextResponse.json({ error: 'Instalment not found' }, { status: 404 });
    }

    // Build update object with only provided fields
    const updateData: Record<string, any> = {};

    if (body.status !== undefined) updateData.status = body.status;
    if (body.paid_date !== undefined) {
      updateData.paid_date = body.paid_date ? new Date(body.paid_date) : null;
    }
    if (body.due_date !== undefined) {
      updateData.due_date = body.due_date ? new Date(body.due_date) : undefined;
    }
    if (body.amount !== undefined) updateData.amount = body.amount;
    if (body.xero_invoice_id !== undefined) updateData.xero_invoice_id = body.xero_invoice_id;
    if (body.xero_invoice_number !== undefined) updateData.xero_invoice_number = body.xero_invoice_number;
    if (body.notes !== undefined) updateData.notes = body.notes;

    // Update the instalment
    const updated = await xata.db.PaymentSchedule.update(instalmentId, updateData);

    return NextResponse.json({
      success: true,
      message: 'Instalment updated successfully',
      instalment: updated,
    });
  } catch (error) {
    console.error('Error updating payment instalment:', error);
    return NextResponse.json(
      { error: 'Failed to update payment instalment' },
      { status: 500 }
    );
  }
}
