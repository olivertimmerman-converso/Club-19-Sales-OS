import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { XataClient } from '@/src/xata';

const xata = new XataClient();

/**
 * GET /api/sales/[id]/payment-schedule
 * Fetch all payment instalments for a sale
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: saleId } = await params;

    // Fetch all payment schedule records for this sale
    const instalments = await xata.db.PaymentSchedule
      .filter({ 'sale.id': saleId })
      .sort('instalment_number', 'asc')
      .getAll();

    return NextResponse.json({
      success: true,
      instalments: instalments.map(inst => ({
        id: inst.id,
        instalment_number: inst.instalment_number,
        due_date: inst.due_date,
        amount: inst.amount,
        status: inst.status,
        paid_date: inst.paid_date,
        xero_invoice_id: inst.xero_invoice_id,
        xero_invoice_number: inst.xero_invoice_number,
        notes: inst.notes,
      })),
    });
  } catch (error) {
    console.error('Error fetching payment schedule:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payment schedule' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sales/[id]/payment-schedule
 * Create payment plan with instalments
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: saleId } = await params;
    const body = await req.json();

    // Validate request body
    if (!body.instalments || !Array.isArray(body.instalments)) {
      return NextResponse.json(
        { error: 'Invalid request: instalments array required' },
        { status: 400 }
      );
    }

    // Verify sale exists
    const sale = await xata.db.Sales.read(saleId);
    if (!sale) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
    }

    // Create all payment schedule records
    const createdInstalments = [];
    for (const instalment of body.instalments) {
      const created = await xata.db.PaymentSchedule.create({
        sale: saleId,
        instalment_number: instalment.instalment_number,
        due_date: instalment.due_date ? new Date(instalment.due_date) : undefined,
        amount: instalment.amount,
        status: instalment.status || 'scheduled',
        paid_date: instalment.paid_date ? new Date(instalment.paid_date) : undefined,
        xero_invoice_id: instalment.xero_invoice_id,
        xero_invoice_number: instalment.xero_invoice_number,
        notes: instalment.notes,
      });
      createdInstalments.push(created);
    }

    // Update sale record
    await xata.db.Sales.update(saleId, {
      is_payment_plan: true,
      payment_plan_instalments: body.instalments.length,
    });

    return NextResponse.json({
      success: true,
      message: 'Payment plan created successfully',
      instalments: createdInstalments,
    });
  } catch (error) {
    console.error('Error creating payment schedule:', error);
    return NextResponse.json(
      { error: 'Failed to create payment schedule' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/sales/[id]/payment-schedule
 * Remove payment plan and all instalments
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: saleId } = await params;

    // Delete all payment schedule records for this sale
    const instalments = await xata.db.PaymentSchedule
      .filter({ 'sale.id': saleId })
      .getAll();

    for (const instalment of instalments) {
      await xata.db.PaymentSchedule.delete(instalment.id);
    }

    // Update sale record
    await xata.db.Sales.update(saleId, {
      is_payment_plan: false,
      payment_plan_instalments: null,
    });

    return NextResponse.json({
      success: true,
      message: 'Payment plan removed successfully',
      deletedCount: instalments.length,
    });
  } catch (error) {
    console.error('Error deleting payment schedule:', error);
    return NextResponse.json(
      { error: 'Failed to delete payment schedule' },
      { status: 500 }
    );
  }
}
