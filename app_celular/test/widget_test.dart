// Smoke test: la app carga y muestra los controles principales de disparo.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:aura_mobile/main.dart';

void main() {
  testWidgets('ScanTriggerPage muestra el boton de escaneo', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(const AuraApp());

    expect(find.text('Escanear red'), findsOneWidget);
    expect(find.byIcon(Icons.bolt), findsOneWidget);
  });
}
