Option Explicit

Sub SortAllSheetsByFinanceYearDepartmentStudentRoll()

    Dim ws As Worksheet
    Dim successSheets As Collection
    Dim failedSheets As Collection
    Dim reportText As String
    Dim i As Long
    Dim hdrRow As Long
    Dim headers As Variant
    Dim financeCol As Variant
    Dim yearCol As Variant
    Dim deptCol As Variant
    Dim nameCol As Variant
    Dim rollCol As Variant
    Dim regCol As Variant
    Dim sortCol As Variant
    Dim helperCol As Long
    Dim lastRow As Long
    Dim lastCol As Long
    Dim dataRange As Range
    Dim result As Boolean

    Set successSheets = New Collection
    Set failedSheets = New Collection

    For Each ws In ThisWorkbook.Worksheets

        On Error GoTo SkipSheet

        If ws.ProtectContents Then
            failedSheets.Add ws.Name & " (protected sheet)"
            GoTo NextSheet
        End If

        If Application.WorksheetFunction.CountA(ws.Cells) < 2 Then
            failedSheets.Add ws.Name & " (insufficient data)"
            GoTo NextSheet
        End If

        hdrRow = 1
        lastRow = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
        lastCol = ws.Cells(hdrRow, ws.Columns.Count).End(xlToLeft).Column

        If lastRow <= hdrRow Then
            failedSheets.Add ws.Name & " (no data rows)"
            GoTo NextSheet
        End If

        headers = Application.Transpose(ws.Range(ws.Cells(hdrRow, 1), ws.Cells(hdrRow, lastCol)).Value)

        financeCol = FindHeaderIndex(headers, Array("FINANCE TYPE", "FINANCE", "TYPE OF FINANCE", "CATEGORY", "FINANCE TYPE GROUP"))
        yearCol = FindHeaderIndex(headers, Array("YEAR", "YEAR OF STUDY", "STUDY YEAR"))
        deptCol = FindHeaderIndex(headers, Array("DEPARTMENT", "DEPARTMENT NAME", "DEPT", "DEPT NAME"))
        nameCol = FindHeaderIndex(headers, Array("STUDENT NAME", "NAME", "STUDENT", "FULL NAME"))
        rollCol = FindHeaderIndex(headers, Array("ROLL NUMBER", "ROLL NO", "ROLL NO.", "ROLL"))
        regCol = FindHeaderIndex(headers, Array("REGISTER NUMBER", "REG NO", "REGISTER NO", "REGISTRATION NUMBER"))

        If IsEmpty(financeCol) Or IsEmpty(yearCol) Or IsEmpty(deptCol) Or IsEmpty(nameCol) Then
            failedSheets.Add ws.Name & " (missing required columns)"
            GoTo NextSheet
        End If

        If Not IsEmpty(rollCol) Then
            sortCol = rollCol
        ElseIf Not IsEmpty(regCol) Then
            sortCol = regCol
        Else
            sortCol = Empty
        End If

        RemoveBlankRows ws, hdrRow
        lastRow = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
        If lastRow <= hdrRow Then
            failedSheets.Add ws.Name & " (all rows blank)"
            GoTo NextSheet
        End If

        helperCol = ws.Cells(hdrRow, ws.Columns.Count).End(xlToLeft).Column + 1
        ws.Cells(hdrRow, helperCol).Value = "YEAR SORT"

        Dim r As Long
        For r = 2 To lastRow
            If Len(Trim$(CStr(ws.Cells(r, yearCol).Value))) > 0 Then
                ws.Cells(r, helperCol).Value = NormalizeYearValue(CStr(ws.Cells(r, yearCol).Value))
            Else
                ws.Cells(r, helperCol).Value = 999
            End If
        Next r

        If Not IsEmpty(sortCol) Then
            StandardizeSortKeyRange ws, sortCol
        End If

        lastRow = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
        lastCol = ws.Cells(hdrRow, ws.Columns.Count).End(xlToLeft).Column

        Set dataRange = ws.Range(ws.Cells(hdrRow, 1), ws.Cells(lastRow, lastCol))

        With ws.Sort
            .SortFields.Clear

            .SortFields.Add Key:=ws.Range(ws.Cells(hdrRow + 1, financeCol), ws.Cells(lastRow, financeCol)), _
                SortOn:=xlSortOnValues, Order:=xlAscending, DataOption:=xlSortNormal

            .SortFields.Add Key:=ws.Range(ws.Cells(hdrRow + 1, helperCol), ws.Cells(lastRow, helperCol)), _
                SortOn:=xlSortOnValues, Order:=xlAscending, DataOption:=xlSortNormal

            .SortFields.Add Key:=ws.Range(ws.Cells(hdrRow + 1, deptCol), ws.Cells(lastRow, deptCol)), _
                SortOn:=xlSortOnValues, Order:=xlAscending, DataOption:=xlSortNormal

            .SortFields.Add Key:=ws.Range(ws.Cells(hdrRow + 1, nameCol), ws.Cells(lastRow, nameCol)), _
                SortOn:=xlSortOnValues, Order:=xlAscending, DataOption:=xlSortNormal

            If Not IsEmpty(sortCol) Then
                .SortFields.Add Key:=ws.Range(ws.Cells(hdrRow + 1, sortCol), ws.Cells(lastRow, sortCol)), _
                    SortOn:=xlSortOnValues, Order:=xlAscending, DataOption:=xlSortNormal
            End If

            .SetRange dataRange
            .Header = xlYes
            .MatchCase = False
            .Orientation = xlTopToBottom
            .Apply
        End With

        ws.Cells(1, helperCol).Clear
        ws.Columns(helperCol).Delete

        result = ValidateWorkbookSheetSort(ws, financeCol, helperCol - 1, deptCol, nameCol, sortCol)
        If result Then
            successSheets.Add ws.Name
        Else
            failedSheets.Add ws.Name & " (validation failed)"
        End If

NextSheet:
    Next ws

    reportText = "SORT REPORT" & vbCrLf & vbCrLf

    If successSheets.Count > 0 Then
        reportText = reportText & "Successfully sorted sheets:" & vbCrLf
        For i = 1 To successSheets.Count
            reportText = reportText & "- " & successSheets(i) & vbCrLf
        Next i
    Else
        reportText = reportText & "No sheets were successfully sorted." & vbCrLf
    End If

    If failedSheets.Count > 0 Then
        reportText = reportText & vbCrLf & "Failed or skipped sheets:" & vbCrLf
        For i = 1 To failedSheets.Count
            reportText = reportText & "- " & failedSheets(i) & vbCrLf
        Next i
    End If

    MsgBox reportText, vbInformation, "Workbook Multi-Level Sort Result"
    Exit Sub

SkipSheet:
    failedSheets.Add ws.Name & " (runtime error)"
    Resume NextSheet

End Sub

Private Function FindHeaderIndex(headers As Variant, candidateList As Variant) As Variant
    Dim i As Long
    Dim j As Long
    Dim headerText As String
    Dim candidateText As String

    For i = LBound(headers) To UBound(headers)
        If Not IsError(headers(i)) Then
            headerText = UCase$(Trim$(CStr(headers(i))))
            For j = LBound(candidateList) To UBound(candidateList)
                candidateText = UCase$(Trim$(CStr(candidateList(j))))
                If headerText = candidateText Then
                    FindHeaderIndex = i + 1
                    Exit Function
                End If
            Next j
        End If
    Next i

    FindHeaderIndex = Empty
End Function

Private Function NormalizeYearValue(ByVal yearText As String) As Variant
    Dim t As String
    Dim val As String

    t = UCase$(Trim$(yearText))
    t = Replace(t, " ", "")
    t = Replace(t, "-", "")

    If InStr(1, t, "1ST") > 0 Or InStr(1, t, "FIRST") > 0 Then
        NormalizeYearValue = 1
        Exit Function
    ElseIf InStr(1, t, "2ND") > 0 Or InStr(1, t, "SECOND") > 0 Then
        NormalizeYearValue = 2
        Exit Function
    ElseIf InStr(1, t, "3RD") > 0 Or InStr(1, t, "THIRD") > 0 Then
        NormalizeYearValue = 3
        Exit Function
    ElseIf InStr(1, t, "4TH") > 0 Or InStr(1, t, "FOURTH") > 0 Then
        NormalizeYearValue = 4
        Exit Function
    End If

    On Error Resume Next
    val = CStr(Val(t))
    On Error GoTo 0

    If IsNumeric(val) And Len(val) > 0 Then
        NormalizeYearValue = CLng(val)
    Else
        NormalizeYearValue = 999
    End If
End Function

Private Sub RemoveBlankRows(ws As Worksheet, Optional ByVal hdrRow As Long = 1)
    Dim r As Long
    Dim lastRow As Long
    Dim deleteRange As Range

    lastRow = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row

    For r = lastRow To hdrRow + 1 Step -1
        If Application.WorksheetFunction.CountA(ws.Rows(r)) = 0 Then
            If deleteRange Is Nothing Then
                Set deleteRange = ws.Rows(r)
            Else
                Set deleteRange = Union(deleteRange, ws.Rows(r))
            End If
        End If
    Next r

    If Not deleteRange Is Nothing Then
        deleteRange.Delete Shift:=xlUp
    End If
End Sub

Private Sub StandardizeSortKeyRange(ws As Worksheet, keyCol As Long)
    Dim r As Long
    Dim lastRow As Long
    Dim rawVal As String

    lastRow = ws.Cells(ws.Rows.Count, keyCol).End(xlUp).Row

    For r = 2 To lastRow
        If Len(Trim$(CStr(ws.Cells(r, keyCol).Value))) > 0 Then
            rawVal = UCase$(Replace(Trim$(CStr(ws.Cells(r, keyCol).Value)), " ", ""))
            ws.Cells(r, keyCol).Value = rawVal
        Else
            ws.Cells(r, keyCol).Value = ""
        End If
    Next r
End Sub

Private Function ValidateWorkbookSheetSort(ws As Worksheet, financeCol As Variant, yearSortCol As Long, deptCol As Variant, nameCol As Variant, rollCol As Variant) As Boolean
    Dim lastRow As Long
    Dim i As Long
    Dim prevFinance As String

    On Error GoTo Fail

    lastRow = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
    If lastRow <= 1 Then
        ValidateWorkbookSheetSort = False
        Exit Function
    End If

    prevFinance = ""

    For i = 2 To lastRow
        If Len(Trim$(CStr(ws.Cells(i, financeCol).Value))) > 0 Then
            If prevFinance <> "" Then
                If UCase$(Trim$(CStr(ws.Cells(i, financeCol).Value))) < UCase$(Trim$(prevFinance)) Then
                    ValidateWorkbookSheetSort = False
                    Exit Function
                End If
            End If
        End If

        prevFinance = CStr(ws.Cells(i, financeCol).Value)
    Next i

    ValidateWorkbookSheetSort = True
    Exit Function

Fail:
    ValidateWorkbookSheetSort = False
End Function
