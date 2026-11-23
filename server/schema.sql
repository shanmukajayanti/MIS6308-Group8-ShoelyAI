-- Shoely AI schema (derived from report Section 13). Enumerations enforced via CHECK constraints.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS manager (
  manager_id INTEGER PRIMARY KEY, manager_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('Store Manager','Regional/Ops Manager','Procurement Manager')),
  store_id INTEGER);
CREATE TABLE IF NOT EXISTS store (
  store_id INTEGER PRIMARY KEY, store_name TEXT NOT NULL, store_address TEXT NOT NULL, region TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS item (
  item_id INTEGER PRIMARY KEY, sku TEXT NOT NULL UNIQUE, item_name TEXT NOT NULL, style TEXT NOT NULL,
  size TEXT NOT NULL, colorway TEXT NOT NULL,
  material_category TEXT NOT NULL CHECK (material_category IN ('Footwear','Accessories','Care Products')),
  unit_cost REAL NOT NULL CHECK (unit_cost >= 0), case_pack INTEGER NOT NULL DEFAULT 1,
  UNIQUE (style, size, colorway));
CREATE TABLE IF NOT EXISTS supplier (
  supplier_id INTEGER PRIMARY KEY, supplier_name TEXT NOT NULL UNIQUE, contact_email TEXT NOT NULL,
  lead_time_days INTEGER NOT NULL CHECK (lead_time_days >= 0),
  preferred_channel TEXT NOT NULL CHECK (preferred_channel IN ('EDI','Email','Portal')),
  supplier_valid_flag TEXT NOT NULL CHECK (supplier_valid_flag IN ('Yes','No')));
CREATE TABLE IF NOT EXISTS supplier_item_price (
  supplier_item_price_id INTEGER PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES supplier(supplier_id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES item(item_id) ON DELETE RESTRICT,
  unit_price REAL NOT NULL CHECK (unit_price >= 0), UNIQUE (supplier_id, item_id));
CREATE TABLE IF NOT EXISTS inventory_record (
  item_id INTEGER NOT NULL REFERENCES item(item_id), store_id INTEGER NOT NULL REFERENCES store(store_id),
  quantity_on_hand INTEGER NOT NULL CHECK (quantity_on_hand >= 0), last_updated_at TEXT NOT NULL,
  PRIMARY KEY (item_id, store_id));

-- UC1
CREATE TABLE IF NOT EXISTS monitoring_parameter (
  parameter_id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL REFERENCES item(item_id),
  store_id INTEGER NOT NULL REFERENCES store(store_id), reorder_threshold INTEGER NOT NULL CHECK (reorder_threshold >= 0),
  review_frequency TEXT NOT NULL CHECK (review_frequency IN ('Daily','Weekly','Monthly')),
  set_by INTEGER NOT NULL REFERENCES manager(manager_id), UNIQUE (item_id, store_id));
CREATE TABLE IF NOT EXISTS monitoring_log (
  log_id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL, store_id INTEGER NOT NULL,
  monitor_result TEXT NOT NULL CHECK (monitor_result IN ('Reorder Recommended','No Reorder','Flagged For Review')),
  detail TEXT, log_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reorder_recommendation (
  recommendation_id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL REFERENCES item(item_id),
  store_id INTEGER NOT NULL REFERENCES store(store_id), quantity_on_hand INTEGER NOT NULL,
  reorder_threshold INTEGER NOT NULL, suggested_quantity INTEGER CHECK (suggested_quantity IS NULL OR suggested_quantity >= 0),
  recommended_action TEXT, rationale TEXT,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('Threshold Breach','Periodic Review')),
  review_flag TEXT NOT NULL CHECK (review_flag IN ('Yes','No')),
  recommendation_status TEXT NOT NULL CHECK (recommendation_status IN ('Pending','Handed Off','No Reorder','Flagged For Review','Approved','Rejected')),
  created_at TEXT NOT NULL);
-- an open recommendation is never duplicated for the same item and store
CREATE UNIQUE INDEX IF NOT EXISTS ux_open_rec ON reorder_recommendation(item_id, store_id)
  WHERE recommendation_status IN ('Pending','Handed Off');
CREATE TABLE IF NOT EXISTS notification (
  notification_id INTEGER PRIMARY KEY, manager_id INTEGER NOT NULL REFERENCES manager(manager_id),
  recommendation_id INTEGER REFERENCES reorder_recommendation(recommendation_id) ON DELETE CASCADE,
  kind TEXT NOT NULL, subject TEXT NOT NULL, body TEXT,
  delivery_status TEXT NOT NULL CHECK (delivery_status IN ('Sent','Failed','Retrying')),
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0), sent_at TEXT NOT NULL, read_flag INTEGER NOT NULL DEFAULT 0);

-- UC2
CREATE TABLE IF NOT EXISTS sales_record (
  item_id INTEGER NOT NULL REFERENCES item(item_id), store_id INTEGER NOT NULL REFERENCES store(store_id),
  sale_date TEXT NOT NULL, quantity_sold INTEGER NOT NULL CHECK (quantity_sold >= 0),
  sell_through_rate REAL CHECK (sell_through_rate IS NULL OR (sell_through_rate BETWEEN 0 AND 1)),
  PRIMARY KEY (item_id, store_id, sale_date));
CREATE TABLE IF NOT EXISTS seasonality_data (
  item_id INTEGER NOT NULL REFERENCES item(item_id), period_start TEXT NOT NULL, period_end TEXT NOT NULL,
  seasonality_index REAL NOT NULL CHECK (seasonality_index > 0),
  trend_direction TEXT NOT NULL CHECK (trend_direction IN ('Up','Down','Flat')),
  PRIMARY KEY (item_id, period_start, period_end), CHECK (period_end >= period_start));
CREATE TABLE IF NOT EXISTS forecast_request (
  request_id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL, store_id INTEGER NOT NULL,
  period_start TEXT NOT NULL, period_end TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('Reorder Trigger','Scheduled Cycle')), requested_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS demand_forecast (
  forecast_id INTEGER PRIMARY KEY, request_id INTEGER UNIQUE REFERENCES forecast_request(request_id) ON DELETE SET NULL,
  item_id INTEGER NOT NULL REFERENCES item(item_id), store_id INTEGER NOT NULL REFERENCES store(store_id),
  period_start TEXT NOT NULL, period_end TEXT NOT NULL, predicted_demand INTEGER,
  forecast_confidence TEXT NOT NULL CHECK (forecast_confidence IN ('High','Medium','Low','Unreliable')),
  model_version TEXT NOT NULL, forecast_justification TEXT NOT NULL,
  review_flag TEXT NOT NULL CHECK (review_flag IN ('Yes','No')), outdated_flag TEXT NOT NULL CHECK (outdated_flag IN ('Yes','No')),
  created_at TEXT NOT NULL,
  CHECK (predicted_demand >= 0), CHECK (predicted_demand IS NOT NULL OR forecast_confidence = 'Unreliable'),
  CHECK (period_end >= period_start));

-- UC3 / UC4
CREATE TABLE IF NOT EXISTS requisition (
  requisition_id INTEGER PRIMARY KEY, recommendation_id INTEGER REFERENCES reorder_recommendation(recommendation_id),
  store_id INTEGER NOT NULL REFERENCES store(store_id), forecast_id INTEGER REFERENCES demand_forecast(forecast_id),
  supplier_id INTEGER REFERENCES supplier(supplier_id), inventory_level INTEGER NOT NULL, reorder_threshold INTEGER NOT NULL,
  total_estimated_cost REAL, approval_limit REAL NOT NULL, approval_method TEXT CHECK (approval_method IN ('Auto','Manager')),
  requisition_status TEXT NOT NULL CHECK (requisition_status IN ('Draft','Flagged','On Hold','Pending Auto Approval','Pending Manager Review','Approved','Rejected','Returned For Revision','PO Issued','Failed')),
  status_note TEXT, created_at TEXT NOT NULL,
  CHECK (requisition_status <> 'Pending Auto Approval' OR approval_method = 'Auto'));
CREATE TABLE IF NOT EXISTS requisition_line_item (
  requisition_line_item_id INTEGER PRIMARY KEY,
  requisition_id INTEGER NOT NULL REFERENCES requisition(requisition_id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES item(item_id), recommended_quantity INTEGER NOT NULL CHECK (recommended_quantity > 0),
  unit_price REAL, forecast_justification TEXT, UNIQUE (requisition_id, item_id));
CREATE TABLE IF NOT EXISTS approval_decision (
  decision_id INTEGER PRIMARY KEY, requisition_id INTEGER NOT NULL REFERENCES requisition(requisition_id),
  reviewed_by INTEGER REFERENCES manager(manager_id),
  decision_type TEXT NOT NULL CHECK (decision_type IN ('Approved','Rejected','Returned For Revision','Auto Approved')),
  reviewed_at TEXT NOT NULL, reason TEXT, escalated_flag TEXT NOT NULL DEFAULT 'No' CHECK (escalated_flag IN ('Yes','No')),
  escalated_date TEXT,
  CHECK (decision_type NOT IN ('Rejected','Returned For Revision') OR reason IS NOT NULL),
  CHECK (escalated_flag = 'No' OR escalated_date IS NOT NULL));

-- UC5
CREATE TABLE IF NOT EXISTS purchase_order (
  po_id INTEGER PRIMARY KEY, requisition_id INTEGER NOT NULL UNIQUE REFERENCES requisition(requisition_id),
  supplier_id INTEGER NOT NULL REFERENCES supplier(supplier_id), store_id INTEGER NOT NULL REFERENCES store(store_id),
  issue_date TEXT NOT NULL, expected_ship_date TEXT NOT NULL, expected_delivery_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('drafted','sent','acknowledged','in_production','shipped','delayed','delivered','cancelled')),
  total_amount REAL NOT NULL CHECK (total_amount >= 0), currency TEXT NOT NULL DEFAULT 'USD',
  sent_at TEXT, acknowledged_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  CHECK (expected_delivery_date >= expected_ship_date));
CREATE TABLE IF NOT EXISTS po_line_item (
  po_line_item_id INTEGER PRIMARY KEY, po_id INTEGER NOT NULL REFERENCES purchase_order(po_id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES item(item_id), quantity_ordered INTEGER NOT NULL CHECK (quantity_ordered > 0),
  unit_price REAL NOT NULL CHECK (unit_price >= 0), line_total REAL NOT NULL, UNIQUE (po_id, item_id),
  CHECK (abs(line_total - quantity_ordered * unit_price) < 0.005));
CREATE TABLE IF NOT EXISTS llm_supplier_prompt (
  prompt_id INTEGER PRIMARY KEY, po_id INTEGER NOT NULL REFERENCES purchase_order(po_id) ON DELETE CASCADE,
  channel TEXT NOT NULL, tone TEXT NOT NULL CHECK (tone IN ('transmission','reminder','escalation')),
  subject TEXT, body TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS order_status_update (
  update_id INTEGER PRIMARY KEY, po_id INTEGER NOT NULL REFERENCES purchase_order(po_id) ON DELETE CASCADE,
  reported_status TEXT CHECK (reported_status IS NULL OR reported_status IN ('acknowledged','in_production','shipped','delayed')),
  reported_ship_date TEXT, reported_delivery_date TEXT, raw_text TEXT,
  source TEXT NOT NULL CHECK (source IN ('supplier_api','supplier_email','manual_entry','agent_inference')), update_timestamp TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS delay_flag (
  flag_id INTEGER PRIMARY KEY, po_id INTEGER NOT NULL REFERENCES purchase_order(po_id) ON DELETE CASCADE,
  expected_date TEXT NOT NULL, revised_date TEXT NOT NULL, delay_days INTEGER NOT NULL CHECK (delay_days > 0),
  severity TEXT NOT NULL CHECK (severity IN ('minor','moderate','critical')), reason TEXT NOT NULL, notes TEXT,
  flagged_at TEXT NOT NULL, acknowledged_by INTEGER REFERENCES manager(manager_id), acknowledged_at TEXT);
CREATE TABLE IF NOT EXISTS manager_alert (
  alert_id INTEGER PRIMARY KEY, po_id INTEGER NOT NULL REFERENCES purchase_order(po_id) ON DELETE CASCADE,
  delay_flag_id INTEGER NOT NULL REFERENCES delay_flag(flag_id) ON DELETE CASCADE, recipient_id INTEGER REFERENCES manager(manager_id),
  message TEXT NOT NULL, priority TEXT NOT NULL CHECK (priority IN ('medium','high')), sent_at TEXT NOT NULL, acknowledged_at TEXT);

-- UC6
CREATE TABLE IF NOT EXISTS shipment_receipt (
  receipt_id INTEGER PRIMARY KEY, po_id INTEGER NOT NULL REFERENCES purchase_order(po_id), received_by TEXT NOT NULL,
  received_at TEXT NOT NULL, carrier TEXT, tracking_number TEXT);
CREATE TABLE IF NOT EXISTS received_line_item (
  received_line_item_id INTEGER PRIMARY KEY, receipt_id INTEGER NOT NULL REFERENCES shipment_receipt(receipt_id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES item(item_id), quantity_expected INTEGER NOT NULL CHECK (quantity_expected >= 0),
  quantity_received INTEGER NOT NULL CHECK (quantity_received >= 0),
  item_condition TEXT NOT NULL CHECK (item_condition IN ('good','damaged','partial_damage')), lot_number TEXT, photo_evidence TEXT,
  UNIQUE (receipt_id, item_id));
CREATE TABLE IF NOT EXISTS reconciliation_result (
  receipt_id INTEGER PRIMARY KEY REFERENCES shipment_receipt(receipt_id) ON DELETE CASCADE,
  po_id INTEGER NOT NULL REFERENCES purchase_order(po_id),
  match_status TEXT NOT NULL CHECK (match_status IN ('full_match','partial_match','mismatch')),
  total_quantity_matched INTEGER NOT NULL CHECK (total_quantity_matched >= 0), total_quantity_variance INTEGER NOT NULL CHECK (total_quantity_variance >= 0),
  rationale TEXT);
CREATE TABLE IF NOT EXISTS discrepancy (
  discrepancy_id INTEGER PRIMARY KEY, receipt_id INTEGER NOT NULL REFERENCES reconciliation_result(receipt_id) ON DELETE CASCADE,
  po_id INTEGER NOT NULL REFERENCES purchase_order(po_id), item_id INTEGER NOT NULL REFERENCES item(item_id),
  discrepancy_type TEXT NOT NULL CHECK (discrepancy_type IN ('short_shipment','over_shipment','damaged_goods','wrong_item','quality_mismatch')),
  quantity_variance INTEGER NOT NULL, severity TEXT NOT NULL CHECK (severity IN ('low','medium','high')),
  status TEXT NOT NULL CHECK (status IN ('open','under_review','resolved','escalated','pending_documentation')),
  recommended_action TEXT NOT NULL CHECK (recommended_action IN ('request_credit','request_replacement','accept_variance','return_to_supplier','contact_supplier')),
  summary TEXT, photo_evidence TEXT, resolution TEXT, flagged_at TEXT NOT NULL, resolved_at TEXT,
  CHECK ((status = 'resolved') = (resolved_at IS NOT NULL)));
CREATE TABLE IF NOT EXISTS exception_routing (
  routing_id INTEGER PRIMARY KEY, discrepancy_id INTEGER NOT NULL REFERENCES discrepancy(discrepancy_id) ON DELETE CASCADE,
  routed_to TEXT NOT NULL, reason TEXT NOT NULL, recommended_action TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('low','medium','high')), routed_at TEXT NOT NULL);

-- UC7
CREATE TABLE IF NOT EXISTS stock_flag (
  flag_id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL REFERENCES item(item_id), store_id INTEGER NOT NULL REFERENCES store(store_id),
  flag_type TEXT NOT NULL CHECK (flag_type IN ('Overstock','Deadstock Risk')), flagged_at TEXT NOT NULL,
  quantity_on_hand INTEGER NOT NULL CHECK (quantity_on_hand >= 0), forecasted_demand INTEGER NOT NULL CHECK (forecasted_demand >= 0),
  days_of_supply REAL CHECK (days_of_supply IS NULL OR days_of_supply >= 0), acknowledged_by INTEGER REFERENCES manager(manager_id));

-- UC8
CREATE TABLE IF NOT EXISTS manager_message (
  message_id INTEGER PRIMARY KEY, manager_id INTEGER NOT NULL REFERENCES manager(manager_id),
  store_id INTEGER NOT NULL REFERENCES store(store_id), message_text TEXT NOT NULL, reply_text TEXT, engine TEXT,
  sent_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS action_log (
  log_id INTEGER PRIMARY KEY, manager_id INTEGER REFERENCES manager(manager_id), store_id INTEGER REFERENCES store(store_id),
  message_id INTEGER REFERENCES manager_message(message_id) ON DELETE SET NULL,
  recommendation_id INTEGER REFERENCES reorder_recommendation(recommendation_id) ON DELETE SET NULL,
  intent TEXT NOT NULL CHECK (intent IN ('Instruction','Approval','Rejection','System')),
  action_details TEXT NOT NULL, logged_at TEXT NOT NULL);

-- Platform
CREATE TABLE IF NOT EXISTS setting (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS llm_call_log (
  call_id INTEGER PRIMARY KEY, kind TEXT NOT NULL, model TEXT NOT NULL, prompt TEXT NOT NULL, response TEXT,
  ok INTEGER NOT NULL, created_at TEXT NOT NULL);
